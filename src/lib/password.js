import {getSession,publicKey} from './supabase.js';
import {createPasswordUpdater} from './password-contracts.js';
export const updatePassword=createPasswordUpdater({getSession,publicKey});
