import { trainClassifier, predict, evaluateClassifier } from './personal-recognizer.js';
let model = null;
self.onmessage = ({ data }) => {
  const { id, operation, samples, sample } = data;
  try {
    let result;
    const started = performance.now();
    if (operation === 'train') { model = trainClassifier(samples); result = { labels: model.classes.map(c => c.label), trainingCount: model.trainIds.length }; }
    else if (operation === 'predict') { if (!model) throw new Error('Train your model first.'); result = predict(model, sample); }
    else if (operation === 'evaluate') { if (!model) throw new Error('Train your model first.'); result = evaluateClassifier(model, samples); }
    else if (operation === 'reset') { model = null; result = {}; }
    else throw new Error('Unknown operation.');
    self.postMessage({ id, result, milliseconds: performance.now() - started });
  } catch (error) { if (operation === 'train') model = null; self.postMessage({ id, error: error.message }); }
};
