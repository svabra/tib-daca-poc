import type { DacaNotification } from '@bit-daca/design-system';
import type { WorkflowTaskWire } from './catalog-api.service';
import type { StoredAccessRequest } from './catalog.models';

export function isAccessRequestDecisionTask(taskType:string):boolean {
  return ['access_request_approved','access_request_granted','access_request_rejected'].includes(taskType);
}

/** A request and its review task describe one message, never two unread counts. */
export function catalogNotifications(tasks:readonly WorkflowTaskWire[], requests:readonly StoredAccessRequest[]):readonly DacaNotification[] {
  const result=new Map<string,DacaNotification>();
  for(const task of tasks){
    if(task.status==='completed')continue;
    const requestId=task.taskType==='access_request_review'?task.accessRequestId:null;
    const id=requestId?`request:${requestId}`:`task:${task.id}`;
    if(isAccessRequestDecisionTask(task.taskType) && task.dataProductId && task.accessRequestId){
      result.set(id,{id,title:task.title,detail:task.detail,createdAt:task.createdAt,
        route:`/products/${task.dataProductId}/usage`,queryParams:{request:task.accessRequestId}});
      continue;
    }
    result.set(id,{id,title:task.title,detail:task.detail,createdAt:task.createdAt,route:'/tasks',
      queryParams:requestId?{request:requestId,...(task.dataProductId?{product:task.dataProductId}:{})}:undefined});
  }
  for(const request of requests){
    if(!['submitted','identity_review','legal_review','conditions_review','approved_policy_pending'].includes(request.status))continue;
    const id=`request:${request.id}`;
    const existing=result.get(id);
    result.set(id,{id,title:existing?.title??`${request.requesterName} · ${request.requestNumber}`,detail:`${request.requestNumber} · ${request.purpose}`,createdAt:request.createdAt,route:'/tasks',queryParams:{product:request.dataProductId,request:request.id}});
  }
  return [...result.values()].sort((a,b)=>b.createdAt.localeCompare(a.createdAt)||a.id.localeCompare(b.id));
}
