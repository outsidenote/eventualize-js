import { ESLintUtils } from "@typescript-eslint/utils";
import type { TSESTree } from "@typescript-eslint/utils";

const { RuleCreator } = ESLintUtils;

const createRule = RuleCreator.withoutDocs;

type MessageIds =
  | "invalidStatement"
  | "multipleConsts"
  | "invalidExportDefault"
  | "invalidBuildChain";

/**
 * Returns true if this import declaration imports StreamFactoryBuilder as a named specifier.
 */
function isStreamFactoryImport(node: TSESTree.ImportDeclaration): boolean {
  return node.specifiers.some(
    (s) =>
      s.type === "ImportSpecifier" &&
      s.imported.type === "Identifier" &&
      s.imported.name === "StreamFactoryBuilder",
  );
}

/**
 * Walk the call chain leftward and collect method names.
 * Returns ordered list of method names (e.g. ["withEventType", "withView", "build"])
 * or null if the shape is invalid (not rooted in `new StreamFactoryBuilder(...)`).
 */
function walkCallChain(node: TSESTree.Expression): string[] | null {
  if (node.type === "NewExpression") {
    if (
      node.callee.type === "Identifier" &&
      node.callee.name === "StreamFactoryBuilder"
    ) {
      return [];
    }
    return null;
  }

  if (node.type === "CallExpression") {
    const callee = node.callee;
    if (callee.type !== "MemberExpression") return null;
    if (callee.computed) return null;
    if (callee.property.type !== "Identifier") return null;
    const methodName = callee.property.name;
    const inner = walkCallChain(callee.object as TSESTree.Expression);
    if (inner === null) return null;
    return [...inner, methodName];
  }

  return null;
}

/**
 * Validates that the initializer is a StreamFactoryBuilder chain terminated by .build().
 * Any intermediate method calls are allowed — TypeScript enforces method validity.
 */
function isValidBuildChain(node: TSESTree.Expression): boolean {
  const chain = walkCallChain(node);
  if (chain === null || chain.length === 0) return false;
  return chain[chain.length - 1] === "build";
}

/**
 * Validates a VariableDeclaration is:
 *   const XxxFactory = new StreamFactoryBuilder(...).chain().build();
 * Returns the factory name or null if invalid.
 */
function getValidFactoryName(
  node: TSESTree.VariableDeclaration,
): string | null {
  if (node.kind !== "const") return null;
  if (node.declarations.length !== 1) return null;
  const decl = node.declarations[0];
  if (decl.id.type !== "Identifier") return null;
  if (decl.init === null || decl.init === undefined) return null;
  if (!isValidBuildChain(decl.init)) return null;
  return decl.id.name;
}

/**
 * Validates: export default <factoryName>
 */
function isValidExportDefault(
  node: TSESTree.ExportDefaultDeclaration,
  factoryName: string,
): boolean {
  return (
    node.declaration.type === "Identifier" &&
    node.declaration.name === factoryName
  );
}

/**
 * Validates: export type XxxStreamType = typeof <factoryName>.StreamType
 */
function isValidExportType(
  node: TSESTree.ExportNamedDeclaration,
  factoryName: string,
): boolean {
  if (node.exportKind !== "type") return false;
  if (node.declaration === null || node.declaration === undefined) return false;
  if (node.declaration.type !== "TSTypeAliasDeclaration") return false;

  const typeAnnotation = node.declaration.typeAnnotation;
  if (typeAnnotation.type !== "TSTypeQuery") return false;

  const exprName = typeAnnotation.exprName;
  if (exprName.type !== "TSQualifiedName") return false;

  const left = exprName.left;
  const right = exprName.right;

  return (
    left.type === "Identifier" &&
    left.name === factoryName &&
    right.type === "Identifier" &&
    right.name === "StreamType"
  );
}

export const enforceStreamFactoryModule = createRule<[], MessageIds>({
  name: "enforce-stream-factory-module",
  meta: {
    type: "problem",
    docs: {
      description:
        "Enforce that StreamFactoryBuilder files contain only imports, one factory const, export default, and an optional export type.",
    },
    messages: {
      invalidStatement:
        "StreamFactoryBuilder modules may only contain imports, one const factory declaration, export default, and an export type. Remove this statement.",
      multipleConsts:
        "StreamFactoryBuilder modules must contain exactly one const factory declaration.",
      invalidExportDefault:
        "export default must export the factory const directly (e.g. `export default MyFactory`).",
      invalidBuildChain:
        "The factory initializer must be a StreamFactoryBuilder chain ending with .build().",
    },
    schema: [],
  },
  defaultOptions: [],
  create(context) {
    let isStreamFactoryFile = false;
    let declaredFactoryName: string | null = null;
    let constCount = 0;

    return {
      ImportDeclaration(node) {
        if (isStreamFactoryImport(node)) {
          isStreamFactoryFile = true;
        }
      },

      "Program:exit"(program) {
        if (!isStreamFactoryFile) return;

        for (const statement of program.body) {
          switch (statement.type) {
            case "ImportDeclaration":
              // always allowed
              break;

            case "VariableDeclaration": {
              const name = getValidFactoryName(statement);
              if (name === null) {
                // Use invalidBuildChain only when the init is rooted in StreamFactoryBuilder
                // but is missing the terminating .build() call.
                const init =
                  statement.kind === "const" &&
                  statement.declarations.length === 1
                    ? statement.declarations[0].init
                    : null;
                const chain =
                  init !== null && init !== undefined
                    ? walkCallChain(init)
                    : null;
                const isStreamFactoryChain = chain !== null;
                if (isStreamFactoryChain) {
                  context.report({ node: statement, messageId: "invalidBuildChain" });
                } else {
                  context.report({ node: statement, messageId: "invalidStatement" });
                }
              } else {
                constCount++;
                if (constCount > 1) {
                  context.report({ node: statement, messageId: "multipleConsts" });
                } else {
                  declaredFactoryName = name;
                }
              }
              break;
            }

            case "ExportDefaultDeclaration":
              if (
                declaredFactoryName === null ||
                !isValidExportDefault(statement, declaredFactoryName)
              ) {
                context.report({ node: statement, messageId: "invalidExportDefault" });
              }
              break;

            case "ExportNamedDeclaration":
              if (!isValidExportType(statement, declaredFactoryName ?? "")) {
                context.report({ node: statement, messageId: "invalidStatement" });
              }
              break;

            default:
              context.report({ node: statement, messageId: "invalidStatement" });
              break;
          }
        }
      },
    };
  },
});
