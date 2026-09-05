// Local-only demonstration: no network, persistent storage or clipboard access.
(() => {
  const form=document.querySelector('#preferences');
  if(!form)return;
  const name=form.querySelector('#view-name'),error=form.querySelector('#name-error'),save=form.querySelector('#save-example'),status=form.querySelector('#save-status');
  let submitted=false,busy=false;
  const feedback=(message,tone='')=>{status.textContent=message;status.classList.toggle('good',tone==='good');status.classList.toggle('bad',tone==='bad');};
  const validate=()=>{const invalid=!name.value.trim();name.setAttribute('aria-invalid',String(invalid));error.hidden=!invalid;return !invalid;};
  form.addEventListener('input',()=>{if(!busy)feedback('');});
  name.addEventListener('input',()=>{if(submitted)validate();});
  form.addEventListener('submit',event=>{
    event.preventDefault();if(busy)return;submitted=true;
    if(!validate()){feedback('Enter a view name, then save again.','bad');name.focus();return;}
    busy=true;save.setAttribute('aria-disabled','true');save.setAttribute('aria-busy','true');feedback('Saving local example…');
    const fail=document.querySelector('#simulate-failure').checked;
    // Values remain editable and are never consumed as product data.
    setTimeout(()=>{busy=false;save.removeAttribute('aria-disabled');save.removeAttribute('aria-busy');feedback(fail?'Couldn’t save this example. Your entries are still here. Turn off the failure simulation and try again.':'Example saved for this demonstration. Nothing was stored or sent.',fail?'bad':'good');},600);
  });
  document.querySelector('#clear-example').addEventListener('click',()=>{document.querySelector('#clear-status').textContent='Filters cleared in this demonstration. No search was performed.';});
})();
