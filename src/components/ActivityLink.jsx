import React from 'react';
import {useActivityUnread} from '../lib/social-activity.js';
import {Icon} from './Icon.jsx';

export default function ActivityLink({ownerId,className=''}){
 const {unread,error}=useActivityUnread(ownerId);
 const count=error?null:unread;
 return <a className={`activity-link ${className}`} href="#/social?tab=activity" aria-label={count>0?`Activity, ${count} unread notifications`:'Activity'} title="Activity and crown battles"><Icon name="bell" size={20}/>{count>0&&<span className="activity-count" aria-hidden="true">{count>99?'99+':count}</span>}</a>;
}
