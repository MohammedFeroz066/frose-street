async function verifyLiveHtml() {
  const res = await fetch('https://street.frosetech.com/admin');
  const html = await res.text();
  console.log('HTML length:', html.length);
  console.log('Has inline window.switchView:', html.includes('window.switchView = switchView'));
  console.log('Has onclick on Dashboard tab:', html.includes("onclick=\"window.switchView('dashboard')\""));
  console.log('Has onclick on Vendors tab:', html.includes("onclick=\"window.switchView('vendors')\""));
  console.log('Has onclick on Add Stall button:', html.includes("onclick=\"window.openModal('modal-add-stall')\""));
  console.log('Has cache-control meta tag:', html.includes('http-equiv="Cache-Control"'));
}

verifyLiveHtml();
