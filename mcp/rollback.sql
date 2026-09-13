-- Disable entry points without destroying idempotency/source history.
-- Disable/undeploy only slop-mcp and turn the mobile feature off first.
begin;
revoke execute on function public.mcp_service(text,jsonb) from service_role;
revoke execute on function public.mcp_phone(text,jsonb) from authenticated;
notify pgrst,'reload schema';
commit;
