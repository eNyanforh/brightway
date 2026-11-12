export const program={id:"program",name:"Automotive mechanics",feeMinor:45050,currency:"USD",modules:[]};
export const section={id:"section",name:"Workshop A",capacity:40};
export const intake={id:"intake",name:"November intake",programId:"program",program,startsOn:"2026-11-01",endsOn:"2026-12-31",startedAt:"2026-11-01",minimumAttendance:75,version:2,sections:[section]};
export const learner={id:"learner",status:"ACTIVE",version:2,account:{id:"learner-account",username:"synthetic_learner",fullName:"Synthetic Learner"}};
export const enrolment={id:"enrolment",campusId:"campus",learnerId:"learner",learner,intake,section,status:"ACTIVE",version:2,certificate:null};
export const assignment={id:"assignment",intakeId:"intake",intake,section,module:null,version:1,instructor:{id:"instructor",username:"synthetic_instructor",fullName:"Synthetic Instructor"},schedules:[]};
export const assessment={id:"assessment",assignmentId:"assignment",title:"Engine practical",kind:"PRACTICAL",required:true,maxScore:null,passingMark:null,heldOn:"2026-11-05",assignment,results:[]};
export const setup=(canManage=true)=>({campusId:"campus",displayName:"Synthetic TVET Institute",canManage,intakeId:"intake",intakes:[intake],programs:[program],assignments:[assignment],discoverPrograms:[]});
export const report=()=>({engine:"TVET",schoolName:"Synthetic TVET Institute",enrolment,progress:{eligible:false,attendancePercent:50,minimumAttendance:75,blockers:["Minimum attendance has not been met."],assessments:[{...assessment,attempts:[]}]},assignments:[assignment],attendance:[],announcements:[]});
