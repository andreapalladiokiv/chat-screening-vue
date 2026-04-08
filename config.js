// Chat View Configuration
// config.js is gitignored and should never be committed.
//
// Multi-environment format: define an "environments" array to enable the
// environment selector dropdown on the login screen.
//superb asdasd
window.CHAT_VIEW_CONFIG = {
  environments: [
    {
      // Display name shown in the dropdown
      name: 'Development',
      // Supabase project subdomain (e.g. 'abcdefghij' from abcdefghij.supabase.co)
      projectId: 'mzxwumuslpaxswuztuak',
      // Supabase project's anon/public key
      anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im16eHd1bXVzbHBheHN3dXp0dWFrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDU1ODAzMTgsImV4cCI6MjA2MTE1NjMxOH0.Bink_MhmPnpp_pIZ3MEgZv3LAwbFu2WvIcqIaISFtbU',
      // Restrict sign-in to specific email domains. Leave empty to allow all.
      allowedDomains: [],
      // Fixed filter dropdown options (avoids dynamic RPC fetch)
      filterOptions: {
        tools: [],
        categories: [],
        requestTypes: [],
        projects: [],
        visitorTypes: [],
        languages: [],
      },
    },
    {
      name: 'Production',
      // Replace with your dev Supabase project subdomain
      projectId: 'lyelqfxmfooczmyopfic',
      // Replace with your dev Supabase anon key
      anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx5ZWxxZnhtZm9vY3pteW9wZmljIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzczNzU0MDksImV4cCI6MjA1Mjk1MTQwOX0.hcSeDNGNup_rr-bQpbbI8BOOgfWhAc8uVljsQkCy1s8',
      allowedDomains: [],
      filterOptions: {
        tools: [],
        categories: [],
        requestTypes: [],
        projects: [],
        visitorTypes: [],
        languages: [],
      },
    },
    {
      name: 'Stage',
      // Replace with your dev Supabase project subdomain
      projectId: 'mompzsurvrgdjanubshq',
      // Replace with your dev Supabase anon key
      anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1vbXB6c3VydnJnZGphbnVic2hxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Mzc3MTY5NDAsImV4cCI6MjA1MzI5Mjk0MH0.2cLbaHHd1ru6FRoHKxCa_LSWASECRfiVHP3mAls8nbc',
      allowedDomains: [],
      filterOptions: {
        tools: [],
        categories: [],
        requestTypes: [],
        projects: [],
        visitorTypes: [],
        languages: [],
      },
    },
  ],
};
