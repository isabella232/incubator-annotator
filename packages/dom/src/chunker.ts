/**
 * @license
 * Licensed to the Apache Software Foundation (ASF) under one
 * or more contributor license agreements.  See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership.  The ASF licenses this file
 * to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License.  You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

import { ownerDocument } from "./owner-document";

export interface Chunk<TData extends any> {
  // A Chunk has a primary value (typically a string), and any other info that one may want to add to it.
  readonly data: TData;

  // The initial idea was that a Chunk is any toString-able object. Should suffice for us.
  // But it would not let one create e.g. a Chunk with an array of unicode characters.
  // toString(): string;
}

export interface Chunker<TChunk extends Chunk<any>> {
  readonly currentChunk: TChunk;
  readNext(): TChunk | null;
  readPrev(): TChunk | null;
  // read(length?: 1 | -1, roundUp?: true): TChunk | null;
}

export interface PartialTextNode extends Chunk<string> {
  readonly node: Text;
  readonly startOffset: number;
  readonly endOffset: number;
}

export class TextNodeChunker implements Chunker<PartialTextNode> {

  private iter: NodeIterator;

  get currentChunk() {
    // The NodeFilter will guarantee this is a Text node (except before the
    // first iteration step, but we do such a step in the constructor).
    const node = this.iter.referenceNode as Text;
    const startOffset = (node === this.scope.startContainer) ? this.scope.startOffset : 0;
    const endOffset = (node === this.scope.endContainer) ? this.scope.endOffset : node.length;
    return {
      node,
      startOffset,
      endOffset,
      data: node.data.substring(startOffset, endOffset),
    }
  }

  constructor(private scope: Range) {
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

    if (this.iter.nextNode() === null) {
      throw new RangeError('Range does not contain any Text nodes.');
    }
  }

  readNext() {
    // Move the iterator to after the current node, so nextNode() will cause a jump.
    if (this.iter.pointerBeforeReferenceNode)
      this.iter.nextNode();
    if (this.iter.nextNode())
      return this.currentChunk;
    else
      return null;
  }

  readPrev() {
    if (!this.iter.pointerBeforeReferenceNode)
      this.iter.previousNode();
    if (this.iter.previousNode())
      return this.currentChunk;
    else
      return null;
  }
}
