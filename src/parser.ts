import {
  TypescriptParser,
  DeclarationVisibility,
  ClassDeclaration,
  InterfaceDeclaration,
  TypeAliasDeclaration,
  NamespaceImport,
  NamedImport,
  PropertyDeclaration,
  MethodDeclaration,
} from "typescript-parser";
import type { Declaration, File } from "typescript-parser";

const PRIMITIVES = ["number", "string", "boolean", "object", "any", "unknown"];

const INDENT_LENGTH = 4;

export class TypescriptFileParser extends TypescriptParser {
  private parsedSource!: File;
  private promise!: Promise<File>;
  private definedTypes: string[] = [];
  private readonly methodVisbilityMap: Record<
    DeclarationVisibility,
    "public" | "private" | "protected"
  > = ["private", "protected", "public"];
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

  private isPrimitive = (T: string) => PRIMITIVES.includes(T);

  private isGeneric(T: string): boolean {
    return !(this.isPrimitive(T) || this.isUserDefined(T));
  }

  private getGenerics(T?: string): string[] {
    const generics: string[] = [];
    T?.split(/\||&|extends/).forEach(
      (K) => (K = K.trim()) && this.isGeneric(K) && generics.push(K)
    );
    return generics;
  }

  private isUserDefined(T: string): boolean {
    return this.definedTypes.includes(T);
  }

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
    return this.wrapInPromise(() =>
      this.parsedSource.imports.forEach((import_) => {
        if (import_ instanceof NamespaceImport) {
          this.definedTypes.push(import_.alias);
          return;
        }

        if (import_ instanceof NamedImport) {
          if (import_.defaultAlias) {
            this.definedTypes.push(import_.defaultAlias);
          }

          import_.specifiers.forEach((specifier) => {
            this.definedTypes.push(specifier.alias ?? specifier.specifier);
          });
        }
      })
    );
  }

  private parseClassGenerics(cls: ClassDeclaration): void {
    cls.typeParameters?.forEach((type_) =>
      this.definedTypes.push(
        <string>type_
          .split(/=|(extends)/)
          .at(0)
          ?.trim()
      )
    );
  }

  private async parseDeclaredTypes(): Promise<void> {
    (await this.getTypeDeclarations()).forEach((decl) =>
      this.definedTypes.push(decl.name)
    );
  }

  public async findInterface(className: string): Promise<string> {
    await this.parseImports();
    await this.parseDeclaredTypes();
    const cls = await this.getClass(className);
    this.parseClassGenerics(cls);

    const compiledProperties = cls.properties.map((property) =>
      this.parseProperty(property)
    );
    const compiledMethods = cls.methods.map((method) =>
      this.parseMethod(method)
    );

    const interfaceBody =
      `\n${INDENT_LENGTH}` +
      compiledProperties.join(`\n\n${INDENT_LENGTH}`) +
      `\n\n${INDENT_LENGTH}` +
      compiledMethods.join(`\n\n${INDENT_LENGTH}`) +
      "\n";

    const maybeGenerics = cls.typeParameters
      ? "<" + cls.typeParameters.join(", ") + ">"
      : "";

    return `interface ${className}${maybeGenerics} {` + interfaceBody + `}`;
  }

  parseProperty(property: PropertyDeclaration): string {
    const visibility =
      this.methodVisbilityMap[
        property.visibility ?? DeclarationVisibility.Public
      ];
    const maybeOptional = property.isOptional ? "?" : "";
    const maybeStatic = property.isStatic ? "static" : "";

    return [
      visibility,
      maybeStatic,
      `${property.name}${maybeOptional}:`,
      property.type ?? "any",
    ]
      .filter(Boolean)
      .join(" ");
  }

  parseMethod(method: MethodDeclaration): string {
    const visibility =
      this.methodVisbilityMap[
        method.visibility ?? DeclarationVisibility.Public
      ];

    const parameterString = method.parameters
      .map((param) => `${param.name}: ${param.type ?? "any"}`)
      .join(", ");

    const parameterUndefinedGenerics = method.parameters
      .map((param) => this.getGenerics(param.type))
      .reduce((final, generics) => final.concat(generics), []);
    const returnTypeUndefinedGenerics = this.getGenerics(method.type);
    const genericString = ((undefinedGenerics: string[]) =>
      undefinedGenerics.length ? "<" + undefinedGenerics.join(", ") + ">" : "")(
      [...parameterUndefinedGenerics, ...returnTypeUndefinedGenerics]
    );

    const maybeStatic = method.isStatic ? "static" : "";

    const maybeAbstract = method.isAbstract ? "abstract" : "";

    const maybeOptional = method.isOptional ? "?" : "";

    const maybeAsync = method.isAsync ? "async" : "";

    return [
      visibility,
      maybeAbstract,
      maybeStatic,
      maybeAsync,
      `${method.name}${genericString}(${parameterString})${maybeOptional}:`,
      method.type ?? "any",
    ]
      .filter(Boolean)
      .join(" ");
  }
}
