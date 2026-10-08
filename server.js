const express=require("express");
const http=require("http");
const {Server}=require("socket.io");
const path=require("path");
const fs=require("fs");

const app=express(), server=http.createServer(app), io=new Server(server);
app.use(express.json()); app.use(express.static(path.join(__dirname,"public")));

const DB=path.join(__dirname,"questions.json");
let questions=fs.existsSync(DB)?JSON.parse(fs.readFileSync(DB)):[];

let game={status:"lobby", questionIndex:0, readyUntil:0, answerUntil:0, questions:[], players:{}, readySeconds:5, answerSeconds:20, paused:false};
let timerToken=0;

 app.get("/question/:i",(req,res)=>{const i=Number(req.params.i); const q=game.questions[i]; if(!q)return res.status(404).end(); res.json({text:q.text,options:q.options})});
function save(){fs.writeFileSync(DB,JSON.stringify(questions,null,2))}
function publicPlayers(){return Object.values(game.players).map(p=>({id:p.id,name:p.name,gender:p.gender,score:p.score,answered:p.answer!==null}))}
function broadcast(){io.emit("state",{status:game.status,players:publicPlayers(),questionIndex:game.questionIndex,total:game.questions.length,readyUntil:game.readyUntil,answerUntil:game.answerUntil,readySeconds:game.readySeconds,answerSeconds:game.answerSeconds,paused:game.paused})}

io.on("connection",socket=>{
 socket.on("join",({name,gender,role})=>{
   if(role==="host"){socket.join("host"); socket.emit("hostState",{...game,players:publicPlayers(),questions}); return}
   name=(name||"Marti").trim().slice(0,40); gender=gender==="Lab"?"Lab":"Dhadig";
   game.players[socket.id]={id:socket.id,name,gender,score:0,answer:null};
   socket.emit("joined",{id:socket.id}); broadcast();
 });
 socket.on("hostLoadQuestions",()=>socket.emit("questions",questions));
 socket.on("addQuestion",q=>{
   if(!q||!q.text||!Array.isArray(q.options)||q.options.length!==4||q.correct<0||q.correct>3)return;
   const text=q.text.trim();
   if(questions.some(x=>x.text.toLowerCase()===text.toLowerCase())) return socket.emit("addResult",{ok:false,msg:"Su'aashaas hore ayay ugu jirtaa."});
   const item={id:Date.now().toString(36),text,options:q.options.map(x=>String(x).trim()),correct:Number(q.correct)};
   questions.push(item);save();socket.emit("addResult",{ok:true,msg:"Su'aasha waa la daray."});io.to("host").emit("questions",questions);
 });
 socket.on("hostSetTimers",({readySeconds,answerSeconds})=>{
   readySeconds=Math.max(1,Math.min(60,Number(readySeconds)||5)); answerSeconds=Math.max(5,Math.min(300,Number(answerSeconds)||20));
   game.readySeconds=readySeconds; game.answerSeconds=answerSeconds; socket.emit("hostMsg",`Waqtiga waa la dejiyey: Diyaar ${readySeconds}s, Jawaab ${answerSeconds}s.`); broadcast();
 });
 socket.on("hostPause",()=>{
   if(game.status!=="ready" && game.status!=="answering") return;
   game.paused=!game.paused; timerToken++;
   if(game.paused){ game.readyUntil=0; game.answerUntil=0; }
   else { if(game.status==="ready") startReady(); else startAnswer(); }
   broadcast();
 });
 socket.on("hostStop",()=>{ timerToken++; game.status="lobby"; game.readyUntil=game.answerUntil=0; game.paused=false; broadcast(); });
 socket.on("hostStart",()=>{
   game.questions=[...questions]; game.questionIndex=0;
   Object.values(game.players).forEach(p=>{p.score=0;p.answer=null});
   if(!game.questions.length)return socket.emit("hostMsg","Fadlan marka hore ku dar su'aalo.");
   startReady(); broadcast();
 });
 socket.on("hostNext",()=>{ if(game.status==="results" || game.status==="lobby") startReady(); });
 socket.on("answer",idx=>{
   const p=game.players[socket.id]; if(!p||game.status!=="answering"||Date.now()>game.answerUntil||p.answer!==null)return;
   idx=Number(idx); if(idx<0||idx>3)return;
   p.answer=idx; if(idx===game.questions[game.questionIndex].correct)p.score++;
   socket.emit("answerLocked"); broadcast();
 });
 socket.on("disconnect",()=>{delete game.players[socket.id];broadcast()});
});

function startReady(){
 timerToken++; const token=timerToken;
 if(game.questionIndex>=game.questions.length){game.status="finished";game.readyUntil=game.answerUntil=0;broadcast();return}
 Object.values(game.players).forEach(p=>p.answer=null);
 game.status="ready";game.paused=false;game.readyUntil=Date.now()+game.readySeconds*1000;game.answerUntil=0;broadcast();
 setTimeout(()=>{if(token===timerToken)startAnswer()},game.readySeconds*1000);
}
function startAnswer(){
 if(game.status!=="ready")return;
 timerToken++; const token=timerToken;
 game.status="answering";game.paused=false;game.answerUntil=Date.now()+game.answerSeconds*1000;game.readyUntil=0;broadcast();
 setTimeout(()=>{if(token===timerToken)endQuestion()},game.answerSeconds*1000);
}
function endQuestion(){
 if(game.status!=="answering")return;
 timerToken++; const token=timerToken;
 game.status="results";game.answerUntil=0;game.paused=false;broadcast();
 setTimeout(()=>{if(token===timerToken){game.questionIndex++;startReady()}},5000);
}
server.listen(process.env.PORT||3000,()=>console.log("Tartan Aqoon running"));
