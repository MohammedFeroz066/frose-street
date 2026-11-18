async function checkLive() {
  try {
    const resAdmin = await fetch('https://street.frosetech.com/admin');
    console.log('Status /admin:', resAdmin.status);
    const textAdmin = await resAdmin.text();
    console.log('Admin HTML has TM class:', textAdmin.includes('brand-trademark'));
    const matchScript = textAdmin.match(/<script[^>]*admin\.js[^>]*><\/script>/i);
    console.log('Admin HTML script tag:', matchScript ? matchScript[0] : 'NOT FOUND');

    const resJs = await fetch('https://street.frosetech.com/js/admin.js');
    console.log('Status /js/admin.js:', resJs.status);
    console.log('Cache status /js/admin.js:', resJs.headers.get('cf-cache-status'));
    console.log('Cache-Control /js/admin.js:', resJs.headers.get('cache-control'));
    const textJs = await resJs.text();
    console.log('Length of /js/admin.js:', textJs.length);
    console.log('Has initAdminConsole in live JS:', textJs.includes('initAdminConsole'));
    console.log('Has delegated listener in live JS:', textJs.includes('Unified Delegated Click Listener'));
  } catch (err) {
    console.error('Error fetching live:', err);
  }
}

checkLive();
