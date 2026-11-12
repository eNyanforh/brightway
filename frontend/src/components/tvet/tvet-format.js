export const option=(value,label)=>({value,label});
export const dateLabel=v=>v?v.slice(0,10):"—";
export const timeLabel=v=>String(Math.floor(v/60)).padStart(2,"0")+":"+String(v%60).padStart(2,"0");
export const outcomeLabel=v=>v==="COMPETENT"?"Competent":v==="NOT_YET_COMPETENT"?"Not Yet Competent":"Not assessed";
export const assignmentLabel=a=>`${a.intake.name} / ${a.section?.name||"All sections"} / ${a.module?.name||"Program training"}`;
