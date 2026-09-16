import React from 'react';
import {creatorProgress} from '../lib/creator-contracts.js';
import {Icon} from './Icon.jsx';
export default function CreatorProgress({run}){
 const progress=creatorProgress(run);
 return <div className="creator-progress"><div className="creator-progress-label" aria-live="polite"><span>{progress.label}</span><span>{progress.percent}%</span></div><progress max="6" value={progress.completed} aria-label="Completed build steps"/><ol className="creator-progress-steps">{progress.steps.map(step=><li key={step.id} className={step.complete?'complete':step.current?'current':''} aria-current={step.current?'step':undefined}>{step.complete?<Icon name="check" size={12}/>:<span className="step-dot"/>}<span>{step.label}</span></li>)}</ol>{progress.events.length>0&&<details className="creator-event-details"><summary>Build activity</summary><ol>{progress.events.map((event,i)=><li key={`${event.sequence}-${i}`}>{event.text}</li>)}</ol></details>}</div>;
}
