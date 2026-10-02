// Intentionally no production AuthProvider, account verification or SDK init.
export const useAuth=()=>({ready:true,user:null,session:null,profile:null,requireAuth:()=>false});
export const AuthProvider=({children})=>children;
