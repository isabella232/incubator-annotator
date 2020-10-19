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

import type { Matcher, TextPositionSelector } from '@annotator/selector';
import { ownerDocument } from '../owner-document';
import { TextSeeker, CharSeeker } from '../seek';

export function createTextPositionSelectorMatcher(
  selector: TextPositionSelector,
): Matcher<Range, Range> {
  return async function* matchAll(scope) {
    const document = ownerDocument(scope);

    const { start, end } = selector;

    const codeUnitSeeker = new TextSeeker(scope);
    const codePointSeeker = new CharSeeker(codeUnitSeeker);

    // Create a range to represent the described text in the dom.
    const match = document.createRange();

    // Seek to the start of the match, make the range start there.
    codePointSeeker.seekTo(start);
    match.setStart(codeUnitSeeker.referenceNode, codeUnitSeeker.offsetInReferenceNode);

    // Seek to the end of the match, make the range end there.
    codePointSeeker.seekTo(end);
    match.setEnd(codeUnitSeeker.referenceNode, codeUnitSeeker.offsetInReferenceNode);

    // Yield the match.
    yield match;
  };
}
