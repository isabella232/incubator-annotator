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

import { rangeToTextChunks, Chunk, TextRange, ChunkRange } from '../text-iterator';

export function createTextQuoteSelectorMatcher(
  selector: TextQuoteSelector,
): (scope: Range) => AsyncIterable<TextRange> {
  const abstractMatcher = abstractTextQuoteSelectorMatcher(selector);
  return async function* matchAll(scope) {
    // Turn the scope into a stream of ranges, each wrapping exactly one text node. We wrap it in
    // a range such that the first and last text node can be partially included. Could be changed
    // to e.g. be an object { node: Text, startOffset, endOffset }.
    const textChunks = rangeToTextChunks(scope);

    for await (const abstractMatch of abstractMatcher(textChunks)) {
      const match = document.createRange() as TextRange;
      // The `+…startOffset` part is only relevant for the first chunk, whose text node might be partially in scope.
      match.setStart(abstractMatch.startChunk.startContainer,
        abstractMatch.startIndex + abstractMatch.startChunk.startOffset);
      match.setEnd(abstractMatch.endChunk.startContainer, // (note that startContainer equals endContainer)
        abstractMatch.endIndex + abstractMatch.endChunk.startOffset);
      yield match;
    }
  }
}

export function abstractTextQuoteSelectorMatcher(
  selector: TextQuoteSelector,
): <TChunk extends Chunk>(textChunks: AsyncIterable<TChunk>) => AsyncIterable<ChunkRange<TChunk>> {
  return async function* matchAll<TChunk extends Chunk>(textChunks: AsyncIterable<TChunk>) {
    const exact = selector.exact;
    const prefix = selector.prefix || '';
    const suffix = selector.suffix || '';
    const searchPattern = prefix + exact + suffix;

    let partialMatches: Array<{
      startChunk: TChunk;
      startIndex: number;
      charactersMatched: number;
    }> = [];

    for await (const chunk of textChunks) {
      const chunkValue = chunk.toString();

      // Continue checking any partial matches from the previous chunk(s).
      const remainingPartialMatches: typeof partialMatches = [];
      for (const { startChunk, startIndex, charactersMatched } of partialMatches) {
        if (searchPattern.length - charactersMatched > chunkValue.length) {
          if (chunkValue === searchPattern.substring(charactersMatched, charactersMatched + chunkValue.length)) {
            // The chunk is too short to complete the match; comparison has to be completed in subsequent chunks.
            remainingPartialMatches.push({
              startChunk,
              startIndex,
              charactersMatched: charactersMatched + chunkValue.length,
            });
          }
        }
        else if (chunkValue.startsWith(searchPattern.substring(charactersMatched))) {
          yield {
            startChunk,
            startIndex,
            endChunk: chunk,
            endIndex: searchPattern.length - charactersMatched,
          };
        }
      }
      partialMatches = remainingPartialMatches;

      // Try find the whole pattern in the chunk (possibly multiple times).
      if (searchPattern.length <= chunkValue.length) {
        let fromIndex = 0;
        while (fromIndex <= chunkValue.length) {
          const patternStartIndex = chunkValue.indexOf(searchPattern, fromIndex);
          if (patternStartIndex === -1) break;

          // Correct for the prefix and suffix lengths.
          const matchStartIndex = patternStartIndex + prefix.length;
          const matchEndIndex = matchStartIndex + exact.length;

          yield {
            startChunk: chunk,
            startIndex: matchStartIndex,
            endChunk: chunk,
            endIndex: matchEndIndex,
          };

          // Advance the search forward to detect multiple occurrences within the same chunk.
          fromIndex = matchStartIndex + 1;
        }
      }

      // Check if this chunk ends with a partial match (or even multiple partial matches).
      let newPartialMatches: number[] = [];
      const searchStartPoint = Math.max(chunkValue.length - searchPattern.length + 1, 0);
      for (let i = searchStartPoint; i < chunkValue.length; i++) {
        const character = chunkValue[i];
        newPartialMatches = newPartialMatches.filter(
          partialMatchStartIndex => (character === searchPattern[i - partialMatchStartIndex])
        );
        if (character === searchPattern[0]) newPartialMatches.push(i);
      }
      newPartialMatches.forEach(partialMatchStartIndex => partialMatches.push({
        startChunk: chunk,
        startIndex: partialMatchStartIndex,
        charactersMatched: chunkValue.length - partialMatchStartIndex,
      }));
    }
  };
}
