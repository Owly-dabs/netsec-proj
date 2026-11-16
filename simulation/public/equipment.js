// Physical target identifiers are separate from the detector's signal-column names.
export const EQUIPMENT = [
 ...Array.from({length:6},(_,i)=>['PLC'+(i+1),'P'+(i+1)]),
 ['T101','P1'],['P101','P1'],['dosing-0','P2'],['dosing-1','P2'],['dosing-2','P2'],['mixer','P2'],
 ['T301','P3'],['P301','P3'],['UF','P3'],['T401','P4'],['P401','P4'],['UV','P4'],['NaHSO3','P4'],
 ['cartridge','P5'],['P501','P5'],['RO','P5'],['T601','P6'],['P601','P6'],['T602','P6'],['P602','P6'],['T603','P6'],['P603','P6']
].map(([componentId,stage])=>({componentId,stage}));
