import {
  ClassDeclaration,
  Declaration,
  File,
  InterfaceDeclaration,
  NamedImport,
  NamespaceImport,
  TypeAliasDeclaration,
  TypescriptParser,
} from "typescript-parser";

const PRIMITIVES = ["number", "string", "boolean", "object", "any", "unknown"];

export class TypescriptFileParser extends TypescriptParser {
  private parsedSource!: File;
  private promise!: Promise<File>;
  private definedTypes: string[] = [];
  private genericTypes: { generic: string; templateString: string }[] = [];
  /**
   *
   * @param text source file contents
   */
  constructor(private readonly text: string) {
    super();
    this.promise = this.parseSource(text).then(
      (parsed) => (this.parsedSource = parsed)
    );
  }

  private isPrimitive = (T: string) =>
    T.split(/\||&/).every((K) => PRIMITIVES.includes(K));

  private async wrapInPromise<T>(fn: () => T): Promise<T> {
    return new Promise((resolve, reject) => {
      this.promise.then(() => resolve(fn())).catch(reject);
    });
  }

  public async getClassNames(): Promise<string[]> {
    return this.wrapInPromise(() => {
      console.log(this.parsedSource);
      return this.parsedSource.declarations
        .map((decl) => (decl instanceof ClassDeclaration ? decl.name : null))
        .filter<string>((decl): decl is string => Boolean(decl));
    });
  }

  public async getClass(name: string): Promise<ClassDeclaration> {
    return this.wrapInPromise(() => {
      return this.parsedSource.declarations.find<ClassDeclaration>(
        (decl): decl is ClassDeclaration =>
          decl instanceof ClassDeclaration && decl.name === name
      ) as ClassDeclaration;
    });
  }

  private async getTypeDeclarations(): Promise<Declaration[]> {
    return this.wrapInPromise(() =>
      this.parsedSource.declarations
        .map((decl) => {
          switch (decl.constructor) {
            case InterfaceDeclaration:
            case TypeAliasDeclaration:
            case ClassDeclaration:
              return decl;
            default:
              return null;
          }
        })
        .filter((decl): decl is Declaration => Boolean(decl))
    );
  }

  /**
   * parses the import statements to build the definedTypes array
   */
  private async parseImports(): Promise<void> {
    const importLists = await this.wrapInPromise(() =>
      // this.definedTypes.push(...this.parsedSource.imports.map(import => import.))
      this.parsedSource.imports
        .map((import_) =>
          import_ instanceof NamespaceImport
            ? [import_.alias]
            : import_ instanceof NamedImport
            ? import_.specifiers
                .map((specifier) => specifier.alias ?? specifier.specifier)
                .concat(import_.defaultAlias ? [import_.defaultAlias] : [])
            : null
        )
        .filter<string[]>((elem): elem is string[] => Boolean(elem))
    );
    for (const importList of importLists) {
      importList.forEach((imp) => this.definedTypes.push(imp));
    }
  }

  private async parseClassGenerics(name: string): Promise<void> {
    const types = await this.wrapInPromise(
      async () => (await this.getClass(name)).typeParameters
    );
    types?.forEach((type_) =>
      this.genericTypes.push({
        generic: <string>type_
          .split(/=|(extends)/)
          .at(0)
          ?.trim(),
        templateString: type_,
      })
    );
  }

  private async parseDeclaredTypes(): Promise<void> {
    (await this.getTypeDeclarations()).forEach((decl) =>
      this.definedTypes.push(decl.name)
    );
  }

  public async findInterface(className: string): Promise<string> {
    let parsedString = "";
    /**
     * find out the defined types
     *    * imports
     *    * class typeParameters
     *    * declarations
     */
    await this.parseImports();
    await this.parseDeclaredTypes();
    await this.parseClassGenerics(className);

    return parsedString;
  }
}
