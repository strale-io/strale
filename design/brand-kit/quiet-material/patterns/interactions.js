// Local-only demonstration: no network, persistent storage or clipboard access.
(() => {
  const form=document.querySelector('#preferences');
  if(!form)return;
  const name=form.querySelector('#view-name'),error=form.querySelector('#name-error'),save=form.querySelector('#save-example'),status=form.querySelector('#save-status');
  let submitted=false,busy=false;
  const validate=()=>{const invalid=!name.value.trim();name.setAttribute('aria-invalid',String(invalid));error.hidden=!invalid;return !invalid;};
  name.addEventListener('input',()=>{if(submitted)validate();});
  form.addEventListener('submit',event=>{
    event.preventDefault();if(busy)return;submitted=true;
    if(!validate()){status.textContent='Enter a view name, then save again.';name.focus();return;}
    busy=true;save.setAttribute('aria-disabled','true');save.setAttribute('aria-busy','true');status.textContent='Saving local example…';
    const fail=document.querySelector('#simulate-failure').checked;
    // Values remain editable and are never consumed as product data.
    setTimeout(()=>{busy=false;save.removeAttribute('aria-disabled');save.removeAttribute('aria-busy');status.textContent=fail?'Couldn’t save this example. Your entries are still here. Turn off the failure simulation and try again.':'Example saved for this demonstration. Nothing was stored or sent.';status.classList.toggle('bad',fail);status.classList.toggle('good',!fail);},600);
  });
  document.querySelector('#clear-example').addEventListener('click',()=>{document.querySelector('#clear-status').textContent='Filters cleared in this demonstration. No search was performed.';});
})();
