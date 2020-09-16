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

export interface TextRange extends Range {
  // We guarantee that to always have Text nodes as start and end containers.
  readonly startContainer: Text;
  readonly endContainer: Text;
  cloneRange(): TextRange;

  // Allow only Text nodes to be passed to these methods.
  insertNode(node: Text): void;
  selectNodeContents(node: Text): void;
  setEnd(node: Text, offset: number): void;
  setStart(node: Text, offset: number): void;

  // Do not allow these methods to be used at all.
  selectNode(node: never): void;
  setEndAfter(node: never): void;
  setEndBefore(node: never): void;
  setStartAfter(node: never): void;
  setStartBefore(node: never): void;
  surroundContents(newParent: never): void;
}

export interface Chunk {
  toString(): string;
}

export interface ChunkRange<TChunk> {
  startChunk: TChunk;
  startIndex: number;
  endChunk: TChunk;
  endIndex: number;
}

// Yields ranges whose start and end nodes are both the *same* Text node.
export async function* rangeToTextChunks(scope: Range): AsyncIterable<TextRange> {
  const document = ownerDocument(scope);

  const iter = document.createNodeIterator(
    scope.commonAncestorContainer,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode(node: Text) {
        // Only reveal nodes within the range; and skip any empty text nodes.
        return scope.intersectsNode(node) && node.length > 0
          ? NodeFilter.FILTER_ACCEPT
          : NodeFilter.FILTER_REJECT;
      },
    },
  );

  let node: Text | null;
  while (node = iter.nextNode() as (Text | null)) {
    const range = document.createRange() as TextRange;
    range.selectNodeContents(node);

    if (node === scope.startContainer) {
      range.setStart(node, scope.startOffset);
    }
    if (node === scope.endContainer) {
      range.setEnd(node, scope.endOffset);
    }

    yield range;
  }
}
