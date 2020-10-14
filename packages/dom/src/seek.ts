import { ownerDocument } from "./owner-document";

const E_END = 'Iterator exhausted before seek ended.';

export class Seeker {
  // The node containing our current text position.
  get referenceNode(): Text {
    // The NodeFilter will guarantee this is a Text node (except before the
    // first iteration step, but we do such a step in the constructor).
    return this.iter.referenceNode as Text;
  }

  // The position inside iter.referenceNode where the last seek ended up.
  offsetInReferenceNode = 0;

  // The index of the first character of iter.referenceNode inside the text.
  // get referenceNodeIndex() { return this.position - this.offsetInReferenceNode; }
  referenceNodeIndex = 0;

  // The current text position, i.e. the number of code units passed so far.
  // position = 0;
  get position() { return this.referenceNodeIndex + this.offsetInReferenceNode; }

  // // The number of code points passed so far.
  // codePointCount = 0;

  private iter: NodeIterator;

  // // Counting code points is optional, to save the effort when it is not required.
  // private countCodePoints: boolean;

  constructor(scope: Range, options: {
    // countCodePoints?: boolean
  } = {}) {
    // this.countCodePoints = options.countCodePoints ?? false;

    this.iter = ownerDocument(scope).createNodeIterator(
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

    if (isText(scope.startContainer)) {
      // The scope starts inside the text node. Adjust our index accordingly.
      this.referenceNodeIndex = -scope.startOffset;
      this.offsetInReferenceNode = scope.startOffset;
    }
    // TODO Handle the scope.endOffset as well, and fix behaviour in edge cases
    // (e.g. any use of referenceNode.length is incorrect at the edges).

    // Walk to the start of the first non-empty text node inside the scope.
    this.seekTo(0);
  }

  // seekCodePoints(count: number) {
  // }

  seekBy(count: number) {
    return this.seekTo(this.position + count);
  }

  seekTo(target: number) {
    // Move the iterator to after the current node, so nextNode() would cause a jump.
    if (this.iter.pointerBeforeReferenceNode)
      this.iter.nextNode();

    while (this.position <= target) {
      if (target < this.referenceNodeIndex + this.referenceNode.length) {
        // The target is before the end of the current node.
        // (we use < not ≤: if the target is *at* the end of the node, possibly
        // because the current node is empty, we prefer to take the next node)
        this.offsetInReferenceNode = target - this.referenceNodeIndex;
        // if (this.countCodePoints)
        //   this.codePointCount += [...this.referenceNode.data.substring(oldOffset, this.offsetInReferenceNode)].length;
        break;
      }

      // Move to the start of the next node, while counting the characters of the current one.
      const curNode = this.referenceNode;
      const nextNode = this.iter.nextNode();
      if (nextNode !== null) {
        this.referenceNodeIndex += curNode.length;
        this.offsetInReferenceNode = 0;
        // if (this.countCodePoints)
        //   this.codePointCount += [...curNode.data].length;
      } else {
        // There is no next node. Finish at the end of the last node.
        this.offsetInReferenceNode = this.referenceNode.length;
        // if (this.countCodePoints)
        //   this.codePointCount += [...this.referenceNode.data.substring(this.offsetInReferenceNode)].length;
        // Either the end of this node is our target, or the seek failed.
        if (this.position === target)
          break;
        else
          throw new RangeError(E_END);
      }
    }

    // Move to the start of the current node.
    if (!this.iter.pointerBeforeReferenceNode)
      this.iter.previousNode();

    while (this.position > target) {
      if (this.referenceNodeIndex <= target) {
        this.offsetInReferenceNode = target - this.referenceNodeIndex;
        // if (this.countCodePoints)
        //   this.codePointCount -= [...this.referenceNode.data.substring(this.offsetInReferenceNode, oldOffset)].length;
        break;
      }

      // Move to the end of the previous node.
      // const curNode = this.referenceNode;
      const prevNode = this.iter.previousNode();
      if (prevNode !== null) {
        this.referenceNodeIndex -= this.referenceNode.length;
        this.offsetInReferenceNode = this.referenceNode.length;
        // if (this.countCodePoints)
        //   this.codePointCount -= [...curNode.data].length;
      } else {
        this.offsetInReferenceNode = 0;
        // this.codePointCount -= [...this.referenceNode.data.substring(0, oldOffset)].length;
        throw new RangeError(E_END);
      }
    }
  }
}

function isText(node: Node): node is Text {
  return node.nodeType === Node.TEXT_NODE;
}
