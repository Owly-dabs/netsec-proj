import { test } from 'node:test';
import assert from 'node:assert/strict';
import { routeConnections,auditConnections } from './public/routing.js';
test('pipes route around equipment and terminate at the specified ports',()=>{
 const ports={a:{point:[-3,1.5,0],normal:[1,0,0]},b:{point:[3,1.5,0],normal:[-1,0,0]}};
 const obstacles=[{min:[-.75,.4,-.75],max:[.75,3,.75]}];
 const routes=routeConnections(ports,[['a','b']],obstacles),audit=auditConnections(routes,ports,obstacles);
 assert.equal(audit.terminalErrors,0);assert.equal(audit.equipmentCollisions,0);assert.ok(routes[0].points.length>2);
});
