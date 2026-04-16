// ─── DATA EXPORT / IMPORT ─────────────────────────────────────────────────────

function dataModalOpen(){
  // Populate export stats
  var s = gs();
  var ent = entGetState();
  var stats = [
    (ent.insureds||[]).length + ' accounts',
    Object.keys(s.placements||{}).length + ' placements',
    (s.cwRisks||[]).length + ' cargo war risks',
    (s.bookRows||[]).length + ' book rows',
    (ent.producers||[]).length + ' producers',
    (s.contacts||[]).length + ' contacts'
  ];
  var el = document.getElementById('export-stats');
  if(el) el.textContent = 'Current data: ' + stats.join(' · ');
  document.getElementById('data-modal').style.display = 'flex';
}

function dataExport(){
  var exportData = {
    version: 'og-tool-v11',
    exported: new Date().toISOString(),
    exportedBy: 'OG Broking Placement Tool',
    state: gs(),
    entities: entGetState()
  };

  var json = JSON.stringify(exportData, null, 2);
  var blob = new Blob([json], {type: 'application/json'});
  var a = document.createElement('a');
  var date = new Date().toISOString().slice(0,10);
  a.href = URL.createObjectURL(blob);
  a.download = 'og-tool-export-' + date + '.json';
  a.click();
  URL.revokeObjectURL(a.href);

  showNotice('Export downloaded: og-tool-export-' + date + '.json', 'ok');
}

var _importData = null;

function dataImportRead(input){
  var file = input.files[0];
  if(!file) return;

  document.getElementById('import-filename').textContent = file.name;
  var reader = new FileReader();
  reader.onload = function(e){
    try {
      var data = JSON.parse(e.target.result);

      // Validate
      if(!data.state && !data.entities){
        document.getElementById('import-status').innerHTML =
          '<div class="notice err" style="margin:0">Invalid file — does not appear to be an OG Tool export.</div>';
        document.getElementById('import-status').style.display = 'block';
        return;
      }

      _importData = data;

      // Show preview
      var state = data.state || {};
      var ent   = data.entities || {};
      var lines = [
        'Exported: ' + (data.exported ? new Date(data.exported).toLocaleDateString('en-GB', {day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}) : 'unknown'),
        (ent.insureds||[]).length + ' accounts',
        Object.keys(state.placements||{}).length + ' placements',
        (state.cwRisks||[]).length + ' cargo war risks',
        (state.bookRows||[]).length + ' book rows',
        (ent.producers||[]).length + ' producers',
        (state.contacts||[]).length + ' contacts'
      ];

      document.getElementById('import-preview-text').innerHTML =
        lines.map(function(l){ return '<div>✓ ' + l + '</div>'; }).join('');
      document.getElementById('import-preview').style.display = 'block';
      document.getElementById('import-status').style.display = 'none';

    } catch(err) {
      document.getElementById('import-status').innerHTML =
        '<div class="notice err" style="margin:0">Could not parse file: ' + err.message + '</div>';
      document.getElementById('import-status').style.display = 'block';
    }
  };
  reader.readAsText(file);
}

function dataImportConfirm(){
  if(!_importData) return;

  try {
    // Restore main state
    if(_importData.state){
      localStorage.setItem('og_state_v4', JSON.stringify(_importData.state));
    }
    // Restore entities (separate key)
    if(_importData.entities){
      localStorage.setItem('og_entities_v3', JSON.stringify(_importData.entities));
    }

    _importData = null;
    document.getElementById('data-modal').style.display = 'none';
    showNotice('Data restored successfully — reloading...', 'ok');

    // Reload after short delay so notice is visible
    setTimeout(function(){ window.location.reload(); }, 1200);

  } catch(err) {
    showNotice('Import failed: ' + err.message, 'err');
  }
}

function dataImportCancel(){
  _importData = null;
  document.getElementById('import-preview').style.display = 'none';
  document.getElementById('import-filename').textContent = '';
  document.getElementById('import-file-input').value = '';
}
