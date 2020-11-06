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
import { Chunk, Chunker, ChunkRange, PartialTextNode, TextNodeChunker, chunkRangeEquals } from '../chunker';
import { abstractTextQuoteSelectorMatcher } from '.';
import { DomSeeker, TextSeeker, NonEmptyChunker } from '../seek';

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

  const chunker = new TextNodeChunker(scope);

  // Take the part of the range that falls within the scope.
  range = range.cloneRange();
  if (range.compareBoundaryPoints(Range.START_TO_START, scope) === -1)
    range.setStart(scope.startContainer, scope.startOffset);
  if (range.compareBoundaryPoints(Range.END_TO_END, scope) === 1)
    range.setEnd(scope.endContainer, scope.endOffset);

  return await abstractDescribeTextQuote(
    convertRangeToChunkRange(chunker, range),
    chunker,
  );
}

async function abstractDescribeTextQuote<TChunk extends Chunk<string>>(
  target: ChunkRange<TChunk>,
  scope: Chunker<TChunk>,
): Promise<TextQuoteSelector> {
  const seeker = new TextSeeker(scope as NonEmptyChunker<TChunk>);
  seeker.seekToChunk(target.startChunk, target.startIndex);
  const exact = seeker.readToChunk(target.endChunk, target.endIndex);

  // Starting with an empty prefix and suffix, we search for matches. At each unintended match
  // we encounter, we extend the prefix or suffix just enough to ensure it will no longer match.
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
    let nextMatch = await matches.next();

    if (!nextMatch.done && chunkRangeEquals(nextMatch.value, target)) {
      // This match is the intended one, ignore it.
      nextMatch = await matches.next();
    }

    // If there are no more unintended matches, our selector is unambiguous!
    if (nextMatch.done) return tentativeSelector;

    // TODO either reset chunker to start from the beginning, or rewind the chunker by previous match’s length.
    // chunker.seekTo(0)  or chunker.seek(-prefix)

    // We’ll have to add more prefix/suffix to disqualify this unintended match.
    const unintendedMatch = nextMatch.value;
    const seeker1 = new TextSeeker(scope as NonEmptyChunker<TChunk>);
    const seeker2 = new TextSeeker(scope as NonEmptyChunker<TChunk>); // TODO must clone scope.

    // Count how many characters we’d need as a prefix to disqualify this match.
    seeker1.seekToChunk(target.startChunk, target.startIndex);
    seeker2.seekToChunk(unintendedMatch.startChunk, unintendedMatch.startIndex);
    let sufficientPrefix: string | undefined = prefix;
    while (true) {
      let previousCharacter: string;
      try {
        previousCharacter = seeker1.read(-1);
      } catch (err) {
        sufficientPrefix = undefined; // Start of text reached.
        break;
      }
      sufficientPrefix = previousCharacter + sufficientPrefix;
      if (previousCharacter !== seeker2.read(-1)) break;
    }

    // Use either the prefix or suffix, whichever is shortest.
    if (sufficientPrefix !== undefined && (sufficientSuffix === undefined || sufficientPrefix.length <= sufficientSuffix.length))
      prefix = sufficientPrefix; // chunker.seek(prefix.length - sufficientPrefix.length)
    else if (sufficientSuffix !== undefined)
      suffix = sufficientSuffix;
    else
      throw new Error('Target cannot be disambiguated; how could that have happened‽');
  }
}

function convertRangeToChunkRange(chunker: Chunker<PartialTextNode>, range: Range): ChunkRange<PartialTextNode> {
  const domSeeker = new DomSeeker(chunker);

  domSeeker.seekToBoundaryPoint(range.startContainer, range.startOffset);
  const startChunk = domSeeker.currentChunk;
  const startIndex = domSeeker.offsetInChunk;

  domSeeker.seekToBoundaryPoint(range.endContainer, range.endOffset);
  const endChunk = domSeeker.currentChunk;
  const endIndex = domSeeker.offsetInChunk;

  return { startChunk, startIndex, endChunk, endIndex };
}
