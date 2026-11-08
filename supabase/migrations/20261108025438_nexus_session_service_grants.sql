-- Override project default service-role ALL grants for the private Nexus session table.
revoke all on public.cl_nexus_sessions from service_role;
grant select, insert, delete on public.cl_nexus_sessions to service_role;
notify pgrst, 'reload schema';
