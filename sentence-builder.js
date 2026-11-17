// Only explicit, reviewed meanings. No free-form completion of missing concepts.
export const PHRASES = Object.freeze([
  { concepts: ['I','NEED','WATER'], sentence: 'I need some water.' },
  { concepts: ['PLEASE','HELP','ME'], sentence: 'Could you please help me?' },
  { concepts: ['I','WANT','SHARE','IDEA'], sentence: 'I would like to share an idea.' },
  { concepts: ['I','AGREE','YOUR','SUGGESTION'], sentence: 'I agree with your suggestion.' },
  { concepts: ['PLEASE','REPEAT','QUESTION'], sentence: 'Could you please repeat the question?' },
  { concepts: ['I','DISAGREE','DECISION'], sentence: 'I disagree with this decision.' },
  { concepts: ['I','NEED','HELP'], sentence: 'I need help.' },
  { concepts: ['YES'], sentence: 'Yes.' }, { concepts: ['NO'], sentence: 'No.' },
  { concepts: ['HELLO'], sentence: 'Hello.' }, { concepts: ['THANK YOU'], sentence: 'Thank you.' }
]);
export const CONCEPTS = [...new Set(PHRASES.flatMap(p => p.concepts))];
export function constructSentence(input, { complete = false, uncertain = false } = {}) {
  if (!Array.isArray(input) || input.some(v => typeof v !== 'string')) return { state: 'unsupported', sentence: '', reason: 'Invalid concept sequence.' };
  const concepts = input.map(v => v.trim().toUpperCase());
  if (!concepts.length) return { state: 'empty', sentence: '', reason: 'Waiting for concepts.' };
  if (uncertain || concepts.some(c => !CONCEPTS.includes(c))) return { state: 'uncertain', sentence: '', reason: 'One or more concepts are unrecognized. Review before continuing.' };
  const exact = PHRASES.find(p => p.concepts.length === concepts.length && p.concepts.every((c, i) => c === concepts[i]));
  const prefix = PHRASES.some(p => p.concepts.length > concepts.length && concepts.every((c, i) => c === p.concepts[i]));
  if (exact && complete) return { state: 'ready', sentence: exact.sentence, reason: 'Supported meaning reconstructed. Review before speaking.' };
  if (exact || prefix) return { state: 'incomplete', sentence: '', reason: exact ? 'Finish the message to create a sentence.' : 'More concepts are needed. No sentence has been invented.' };
  return { state: 'unsupported', sentence: '', reason: 'This combination has no verified phrase mapping. Edit the concepts or write your own message.' };
}
