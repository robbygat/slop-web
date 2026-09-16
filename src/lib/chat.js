import {asOwner,result} from './supabase.js';

export const chatInbox=()=>asOwner((_owner,client)=>result(client.rpc('chat_inbox')));

export const createDirectChat=personId=>asOwner((_owner,client)=>result(client.rpc('create_chat',{
  p_member_ids:[personId],p_title:null,
})));

export const chatMessages=conversationId=>asOwner((_owner,client)=>result(client.rpc('chat_messages_for',{
  p_conversation_id:conversationId,
})));

export const sendChatMessage=(conversationId,body)=>asOwner((_owner,client)=>result(client.rpc('send_chat_message',{
  p_conversation_id:conversationId,p_body:body.trim(),p_game_id:null,
})));

export const markChatRead=conversationId=>asOwner((_owner,client)=>result(client.rpc('mark_chat_read',{
  p_conversation_id:conversationId,
})));
