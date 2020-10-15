import { ownerDocument } from "./owner-document";

const E_END = 'Iterator exhausted before seek ended.';

interface BoundaryPointer {
  readonly referenceNode: Node;
  readonly offsetInReferenceNode: number;
}

interface TextBoundaryPointer extends BoundaryPointer{
  readonly referenceNode: Text;
  readonly offsetInReferenceNode: number;
}

interface Chunker<T extends Iterable<any>> {
  read1(): T;
}

interface Seeker<T extends Iterable<any>> extends Chunker<T> {
  readonly position: number;
  read(length: number): T;
  seekBy(length: number): void;
  seekTo(target: number): void;
}

export class Seeker_ implements Seeker<string>, TextBoundaryPointer {
  // The node containing our current text position.
  get referenceNode(): Text {
    // The NodeFilter will guarantee this is a Text node (except before the
    // first iteration step, but we do such a step in the constructor).
    return this.iter.referenceNode as Text;
  }

  // The position inside iter.referenceNode where the last seek ended up.
  offsetInReferenceNode = 0;

  // The index of the first character of iter.referenceNode inside the text.
  // get referenceNodePosition() { return this.position - this.offsetInReferenceNode; }
  private referenceNodePosition = 0;

  // The current text position, i.e. the number of code units passed so far.
  // position = 0;
  get position() { return this.referenceNodePosition + this.offsetInReferenceNode; }

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
      this.referenceNodePosition = -scope.startOffset;
      this.offsetInReferenceNode = scope.startOffset;
    }
    // TODO Handle the scope.endOffset as well, and fix behaviour in edge cases
    // (e.g. any use of referenceNode.length is incorrect at the edges).

    // Walk to the start of the first non-empty text node inside the scope.
    this.seekTo(0);
  }

  // seekCodePoints(count: number) {
  // }

  read(length: number) {
    return this._readOrSeekTo(true, this.position + length);
  }

  read1() {
    return this._readOrSeekTo(true, this.position + 1, true);
  }

  seekBy(length: number) {
    this.seekTo(this.position + length);
  }

  seekTo(target: number) {
    this._readOrSeekTo(false, target);
  }

  private _readOrSeekTo(read: true, target: number, roundUp?: boolean): string
  private _readOrSeekTo(read: false, target: number, roundUp?: boolean): void
  private _readOrSeekTo(read: boolean, target: number, roundUp: boolean = false): string | void {
    let result = '';

    // Move the iterator to after the current node, so nextNode() would cause a jump.
    if (this.iter.pointerBeforeReferenceNode)
      this.iter.nextNode();

    while (this.position <= target) {
      if (!roundUp && target < this.referenceNodePosition + this.referenceNode.length) {
        // The target is before the end of the current node.
        // (we use < not ≤: if the target is *at* the end of the node, possibly
        // because the current node is empty, we prefer to take the next node)
        const oldOffset = this.offsetInReferenceNode;
        this.offsetInReferenceNode = target - this.referenceNodePosition;
        if (read) result += this.referenceNode.data.substring(oldOffset, this.offsetInReferenceNode);
        // if (this.countCodePoints)
        //   this.codePointCount += [...this.referenceNode.data.substring(oldOffset, this.offsetInReferenceNode)].length;
        break;
      }

      // Move to the start of the next node, while counting the characters of the current one.
      if (read) result += this.referenceNode.data.substring(this.offsetInReferenceNode);
      const curNode = this.referenceNode;
      const nextNode = this.iter.nextNode();
      if (nextNode !== null) {
        this.referenceNodePosition += curNode.length;
        this.offsetInReferenceNode = 0;
        // if (this.countCodePoints)
        //   this.codePointCount += [...curNode.data.substring(curOffset)].length;
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

    if (read) return result;

    // Move to the start of the current node to prepare for moving backwards.
    if (!this.iter.pointerBeforeReferenceNode)
      this.iter.previousNode();

    while (this.position > target) {
      if (this.referenceNodePosition <= target) {
        this.offsetInReferenceNode = target - this.referenceNodePosition;
        // if (this.countCodePoints)
        //   this.codePointCount -= [...this.referenceNode.data.substring(this.offsetInReferenceNode, oldOffset)].length;
        break;
      }

      // Move to the end of the previous node.
      // const curNode = this.referenceNode;
      const prevNode = this.iter.previousNode();
      if (prevNode !== null) {
        this.referenceNodePosition -= this.referenceNode.length;
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

class CharSeeker implements Seeker<String[]>, TextBoundaryPointer {
  constructor(public readonly raw: Seeker<String> & TextBoundaryPointer) {
  }

  position = 0;
  get referenceNode() { return this.raw.referenceNode };
  get offsetInReferenceNode() {
    const substring = this.referenceNode.data.substring(0, this.raw.offsetInReferenceNode);
    return [...substring].length;
  };

  seekBy(length: number) {
    return this.seekTo(this.position + length);
  }

  seekTo(target: number) {
    this._readOrSeekTo(target, false);
  }

  read(length: number) {
    return this._readOrSeekTo(this.position + length, true);
  }

  read1() {
    const nextChunk = this.raw.read1();
    const characters = [...nextChunk];
    this.position += characters.length;
    return characters;
  }

  private _readOrSeekTo(target: number, read: true): string[];
  private _readOrSeekTo(target: number, read: false): void;
  private _readOrSeekTo(target: number, read: boolean): string[] | void {
    let characters: string[] = [];
    let result: string[] = [];
    while (this.position < target) {
      characters = this.read1();
      if (read) result = result.concat(characters);
    }
    const overshootInCodePoints = this.position - target;
    const overshootInCodeUnits = characters.slice(overshootInCodePoints).join('').length;
    this.raw.seekBy(-overshootInCodeUnits);
    if (read) return result;
  }
}
