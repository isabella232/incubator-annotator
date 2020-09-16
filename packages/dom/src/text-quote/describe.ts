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

import type { TextQuoteSelector } from '@annotator/selector';

import { ownerDocument } from '../owner-document';
import { ChunkRange, Chunk, rangeToTextChunks } from '../text-iterator';
import { abstractTextQuoteSelectorMatcher } from './match';

export async function describeTextQuote(
  range: Range,
  scope?: Range,
): Promise<TextQuoteSelector> {
  // Default to search in the whole document.
  if (scope === undefined) {
    const document = ownerDocument(range);
    scope = document.createRange();
    scope.selectNodeContents(document);
  }
  range = range.cloneRange();

  // Take the part of the range that falls within the scope.
  if (range.compareBoundaryPoints(Range.START_TO_START, scope) === -1)
    range.setStart(scope.startContainer, scope.startOffset);
  if (range.compareBoundaryPoints(Range.END_TO_END, scope) === 1)
    range.setEnd(scope.endContainer, scope.endOffset);

  return await abstractDescribeTextQuote(
    {
      startChunk: range.startContainer,
      startIndex: range.startOffset,
      endChunk: range.endContainer,
      endIndex: range.endOffset,
    },
    rangeToTextChunks(scope),
  );
}

async function abstractDescribeTextQuote(
  target: ChunkRange<any>,
  scope: AsyncIterable<Chunk>,
): Promise<TextQuoteSelector> {
  const exact = readChunks(target);
  const { prefix, suffix } = await calculateContextForDisambiguation(target, scope);
  return {
    type: 'TextQuoteSelector',
    exact,
    prefix,
    suffix,
  };
}

async function calculateContextForDisambiguation(
  target: ChunkRange<any>,
  scope: AsyncIterable<Chunk>,
): Promise<{ prefix: string; suffix: string }> {
  const exact = target.toString();
  let prefix = '';
  let suffix = '';

  while (true) {
    const tentativeSelector: TextQuoteSelector = {
      type: 'TextQuoteSelector',
      exact,
      prefix,
      suffix,
    }
    const matches = abstractTextQuoteSelectorMatcher(tentativeSelector)(scope);
    const nextMatch = await matches.next();
    if (nextMatch.done) break;
    const match = nextMatch.value;

    if (
      match.startChunk === target.startChunk
      && match.endChunk === target.endChunk
      && match.startIndex === target.startIndex
      && match.endIndex === target.endIndex
    ) {
      // This match is the intended one, ignore it.
      continue;
    }

    const sufficientPrefix = charactersNeededToBeUnique(
      match,
      target,
      true,
    );
    const sufficientSuffix = charactersNeededToBeUnique(
      match,
      target,
      false,
    );

    // Use either the prefix or suffix, whichever is shortest.
    if (sufficientPrefix !== undefined && (sufficientSuffix === undefined || sufficientPrefix.length <= sufficientSuffix.length))
      prefix = sufficientPrefix;
    else if (sufficientSuffix !== undefined)
      suffix = sufficientSuffix;
    else
      throw new Error('Target cannot be disambiguated; how could that have happened‽');
  }

  return { prefix, suffix };
}

function charactersNeededToBeUnique(
  match: ChunkRange<any>,
  target: ChunkRange<any>,
  reverse: boolean,
): string | undefined {
  // TODO. How?
}

function readChunks(
  {
    startChunk,
    startIndex,
    endChunk,
    endIndex,
  }: ChunkRange<Chunk>
): string {
  if (startChunk === endChunk)
    return startChunk.toString().substring(startIndex, endIndex);

  let text = startChunk.toString().substring(startIndex);
  let curChunk = startChunk;
  while (curChunk && curChunk !== endChunk) {
    curChunk = nextChunk(curChunk);
    text += curChunk.toString();
  }
  text += endChunk.toString().substring(0, endIndex);
  return text;
}

function nextChunk(chunk: Chunk): Chunk {
  // TODO. How?
}
