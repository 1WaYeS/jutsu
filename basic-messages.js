// Only completed outputs from the isolated gesture recognizer reach this controller.
// It never infers unsupported words or adds missing concepts.
export const BASIC_GESTURES = [
 {phrase:'Hello',short:'Wave an open hand.',guide:'Raise an open hand and give a small, comfortable side-to-side wave.',note:'The camera supports a familiar greeting wave. See the dictionary for the formal ASL HELLO sign; the two are not identical.',reference:'https://www.lifeprint.com/asl101/pages-signs/h/hello.htm'},
 {phrase:'Yes',short:'Gently nod a loose fist.',guide:'Loosely close your fingers. Bend your wrist forward and partway back, like a small nod.',note:'A comfortable bend is enough. Keep your wrist visible; there is no need to force a tight fist.',reference:'https://www.lifeprint.com/asl101/pages-signs/y/yes.htm'},
 {phrase:'No',short:'Close two fingers toward your thumb.',guide:'Hold your index and middle fingers near each other, then bring them toward your thumb.',note:'The recognizer allows a small gap and slight finger variation. Pause briefly before the next gesture.',reference:'https://www.lifeprint.com/asl101/pages-signs/n/no.htm'},
 {phrase:'More',short:'Bring gathered fingertips together.',guide:'Gather each hand into a flattened O. Gently bring the fingertips of both hands together, then separate them.',note:'New experimental detection. Both hands must stay visible. Allow a comfortable gap; do not force fingertip contact.',reference:'https://www.lifeprint.com/asl101/pages-signs/m/more.htm',new:true},
 {phrase:'You',short:'Point your index finger toward the person.',guide:'Point your index finger toward the person you mean, with the other fingers comfortably folded. For this camera prototype, point toward the camera and hold briefly.',note:'Experimental isolated YOU. It does not infer who is being addressed or recognize the plural sweeping version.',reference:'https://www.lifeprint.com/asl101/pages-signs/y/you.htm',new:true}
];
export const REFERENCE_GESTURES = [
 {phrase:'Please',short:'Circle a flat hand over your chest.',guide:'Place your flat dominant hand at the center of your chest and move it in a small circle.',reference:'https://www.lifeprint.com/asl101/pages-signs/p/please.htm'},
 {phrase:'Sorry',short:'Circle a loose fist over your chest.',guide:'Place a loose fist over your chest and make a small circular movement.',reference:'https://www.lifeprint.com/asl101/pages-signs/s/sorry.htm'},
 {phrase:'Water',short:'Tap a W handshape at your mouth.',guide:'Form a W with your index, middle, and ring fingers. Tap the index finger at your mouth twice.',reference:'https://www.lifeprint.com/asl101/pages-signs/w/water.htm'},
 {phrase:'Thank you',short:'Move a flat hand outward from your chin.',guide:'Start with the fingertips of a flat hand near your chin, then move the hand outward.',reference:'https://www.lifeprint.com/asl101/pages-signs/t/thankyou.htm'},
 {phrase:'Help',short:'Lift a thumb-up fist on an open palm.',guide:'Rest a thumb-up fist on your other open palm, then lift both hands together.',reference:'https://www.lifeprint.com/asl101/pages-signs/h/help.htm'}
].map(gesture=>({...gesture,note:'Reference only · not detected by the main camera. Open the signing reference for a demonstration.',referenceOnly:true}));
export class BasicMessageController {
 constructor({speech,onChange=()=>{}}){this.speech=speech;this.onChange=onChange;this.audio=false;this.text='';}
 setAudio(enabled){this.audio=!!enabled;if(!this.audio)this.speech.stop();this.onChange(this.text,this.audio);}
 accept(phrase){if(!BASIC_GESTURES.some(g=>g.phrase===phrase))return false;this.text=`${phrase}${phrase==='Hello'?'!':'.'}`;this.onChange(this.text,this.audio);if(this.audio)this.replay();return true;}
 replay(){if(!this.audio||!this.text)return false;return this.speech.speak(this.text,{voice:this.speech.voices()[0]});}
 clear(){this.speech.stop();this.text='';this.onChange('',this.audio);}
}
