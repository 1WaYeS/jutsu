export async function createEnhancedTracker(workerPath = '/ai/personal-tracker.worker.js') {
  const worker = new Worker(workerPath, { type: 'module' });
  try {
    await new Promise<void>((resolve,reject) => {
      worker.onmessage=({data})=>data.type==='ready'?resolve():reject(new Error(data.message || 'Tracker startup failed.'));
      worker.onerror=event=>reject(new Error(event.message)); worker.postMessage({type:'init'});
    });
  } catch(error) { worker.terminate(); throw error; }
  let running=false, busy=false, callback:any;
  worker.onmessage=({data})=>{busy=false;if(running) { if(data.type==='frame')callback(data); else callback({error:data.message}); }};
  return {
    start(video:HTMLVideoElement,onFrame:any) {
      running=true;callback=onFrame;
      const tick=()=>{
        if(!running)return;
        if(!busy && video.readyState>=2 && video.videoWidth>0) {
          busy=true;const t=performance.now();
          createImageBitmap(video).then(bitmap=>{if(!running){bitmap.close();busy=false;return;}worker.postMessage({type:'frame',bitmap,t},[bitmap]);}).catch(()=>{busy=false;});
        }
        if('requestVideoFrameCallback' in video)video.requestVideoFrameCallback(tick);else requestAnimationFrame(tick);
      };tick();
    },
    dispose(){running=false;worker.terminate();}
  };
}
