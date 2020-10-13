import { ownerDocument } from "./owner-document";

const E_END = 'Iterator exhausted before seek ended.';
const E_WHERE = 'Argument of seek must be an integer or a Text Node.';

export class Seeker {
  iter: NodeIterator;

  constructor(scope: Range) {
    const document = ownerDocument(scope);
    this.iter = document.createNodeIterator(
      scope.commonAncestorContainer,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode(node: Text) {
          return scope.intersectsNode(node)
            ? NodeFilter.FILTER_ACCEPT
            : NodeFilter.FILTER_REJECT;
        },
      },
    );
  }

  getCurrentNode() {
    return this.iter.referenceNode;
  }

  seek(where: number | Text): number {
    const iter = this.iter;

    let count = 0;
    let node: Node | null = iter.referenceNode;
    let predicates = null;

    if (isInteger(where)) {
      predicates = {
        forward: () => count < where,
        backward: () => count > where || !iter.pointerBeforeReferenceNode,
      };
    } else if (isText(where)) {
      predicates = {
        forward: before(node, where) ? () => false : () => node !== where,
        backward: () => node !== where || !iter.pointerBeforeReferenceNode,
      };
    } else {
      throw new TypeError(E_WHERE);
    }

    while (predicates.forward()) {
      node = iter.nextNode();

      if (node === null) {
        throw new RangeError(E_END);
      }

      count += (node as Text).data.length;
    }

    // If there are subsequent nodes, move to ‘before’ the next non-empty
    // node (or the last node, in case all subsequent nodes are empty).
    // As this moves from ‘after’ the current node, count is not changed.
    if (iter.nextNode()) {
      node = iter.referenceNode;
      while (node !== null && (node as Text).data.length === 0) { // node should always be Text now due to the NodeFilter.
        node = iter.nextNode();
      }
      // Note this direction switch stays within the same node.
      node = iter.previousNode();
    }

    while (predicates.backward()) {
      node = iter.previousNode();

      if (node === null) {
        throw new RangeError(E_END);
      }

      count -= (node as Text).data.length;
    }

    if (!isText(iter.referenceNode)) {
      throw new RangeError(E_END);
    }

    return count;
  }
}

function isInteger(n: any): n is number {
  if (typeof n !== 'number') return false;
  return isFinite(n) && Math.floor(n) === n;
}

function isText(node: Node): node is Text {
  return node.nodeType === Node.TEXT_NODE;
}

function before(ref: Node, node: Node): boolean {
  return !!(ref.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_PRECEDING);
}
