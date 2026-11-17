import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';
let tracker: HandLandmarker;
self.onmessage = async ({data}) => {
  if(data.type==='init') {
    try {
      const files=await FilesetResolver.forVisionTasks('/ai/vendor/mediapipe/wasm',true);
      tracker=await HandLandmarker.createFromOptions(files,{
        baseOptions:{modelAssetPath:'/ai/vendor/mediapipe/models/hand_landmarker.task',delegate:'CPU'},
        runningMode:'VIDEO',numHands:2,minHandDetectionConfidence:.45,minHandPresenceConfidence:.45,minTrackingConfidence:.45
      });
      self.postMessage({type:'ready'});
    } catch(error){self.postMessage({type:'error',message:String(error)});}
    return;
  }
  if(data.type!=='frame')return;
  try {
    const started=performance.now(), result=tracker.detectForVideo(data.bitmap,data.t);
    self.postMessage({type:'frame',t:data.t,ms:performance.now()-started,hands:result.landmarks.map((image,i)=>({image,world:result.worldLandmarks[i],side:result.handedness[i]?.[0]?.categoryName}))});
  } catch(error){self.postMessage({type:'error',message:String(error)});}
  finally{data.bitmap.close();}
};
