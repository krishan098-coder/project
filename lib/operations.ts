import {AppError,integer,text,requireRole} from './domain.ts';
type Actor={id:string;role:string};
function readRole(user:Actor){requireRole(user,'cutting_supervisor','cutting_verifier');}
export async function inventory(db:D1Database,user:Actor){
 readRole(user);
 const rolls=(await db.prepare('SELECT * FROM fabric_rolls ORDER BY roll_code').all()).results;
 const movements=(await db.prepare('SELECT m.*,r.roll_code,u.full_name AS actor_name FROM fabric_movements m JOIN fabric_rolls r ON r.id=m.roll_id JOIN users u ON u.id=m.actor_id ORDER BY m.timestamp DESC LIMIT 100').all()).results;
 return {rolls,movements};
}
export async function addRoll(db:D1Database,user:Actor,body:any){
 requireRole(user,'cutting_supervisor');
 const code=text(body.roll_code,'Roll code'), material=text(body.material,'Material'),color=text(body.color,'Colour'),supplier=text(body.supplier,'Supplier');
 const qty=integer(body.quantity,'Opening yards',1),reorder=integer(body.reorder_yds,'Reorder level');
 const id=crypto.randomUUID(),now=new Date().toISOString();
 if(await db.prepare('SELECT id FROM fabric_rolls WHERE roll_code=?').bind(code).first())throw new AppError(409,'That fabric roll already exists.');
 try{await db.batch([
  db.prepare('INSERT INTO fabric_rolls (id,roll_code,material,color,supplier,available_yds,reorder_yds,created_by,created_at) VALUES (?,?,?,?,?,?,?,?,?)').bind(id,code,material,color,supplier,qty,reorder,user.id,now),
  db.prepare('INSERT INTO fabric_movements VALUES (?,?,?,?,?,?,?,?)').bind(crypto.randomUUID(),id,'OPENING',qty,'Opening balance',user.id,now,crypto.randomUUID())
 ]);}catch(error){if(String(error).includes('UNIQUE'))throw new AppError(409,'That fabric roll already exists.');throw error;}
 return inventory(db,user);
}
export async function moveStock(db:D1Database,user:Actor,id:string,body:any){
 requireRole(user,'cutting_supervisor');
 const qty=integer(body.quantity,'Yards',1),revision=integer(body.revision,'Revision'),note=text(body.note,'Stock movement note',500);
 if(!['RECEIPT','ISSUE'].includes(body.kind))throw new AppError(422,'Choose receipt or issue.');
 const roll=await db.prepare('SELECT * FROM fabric_rolls WHERE id=?').bind(id).first<any>();
 if(!roll)throw new AppError(404,'Fabric roll not found.');
 if(roll.revision!==revision)throw new AppError(409,'Stock changed. Refresh before continuing.');
 const delta=body.kind==='ISSUE'?-qty:qty;
 if(roll.available_yds+delta<0)throw new AppError(422,'Insufficient fabric available.');
 if(roll.available_yds+delta>1000000)throw new AppError(422,'Stock cannot exceed 1,000,000 yards.');
 const token=crypto.randomUUID(),now=new Date().toISOString();
 // The ledger row and balance change are atomic. A stale revision inserts neither.
 const out=await db.batch([
  db.prepare('INSERT INTO fabric_movements (id,roll_id,kind,quantity,note,actor_id,timestamp,mutation_token) SELECT ?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM fabric_rolls WHERE id=? AND revision=? AND available_yds+? BETWEEN 0 AND 1000000)').bind(token,id,body.kind,qty,note,user.id,now,token,id,revision,delta),
  db.prepare('UPDATE fabric_rolls SET available_yds=available_yds+?,revision=revision+1 WHERE id=? AND revision=? AND EXISTS(SELECT 1 FROM fabric_movements WHERE mutation_token=?)').bind(delta,id,revision,token)
 ]);
 if(!out[0].meta.changes)throw new AppError(409,'Stock changed. Refresh before continuing.');
 return inventory(db,user);
}
export async function plans(db:D1Database,user:Actor){readRole(user);return (await db.prepare('SELECT p.*,r.name AS recipe_name,r.std_fabric_yards,u.full_name AS planner_name FROM production_plans p JOIN recipes r ON r.id=p.recipe_id JOIN users u ON u.id=p.created_by ORDER BY p.due_date,p.created_at').all()).results;}
export async function addPlan(db:D1Database,user:Actor,body:any){
 requireRole(user,'cutting_supervisor');
 const recipe=text(body.recipe_id,'Recipe'),qty=integer(body.target_qty,'Target quantity',1),date=text(body.due_date,'Due date');
 if(qty>500000)throw new AppError(422,'Target must not exceed 500,000 garments.');
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date)throw new AppError(422,'Choose a valid due date.');
 if(!['NORMAL','HIGH','URGENT'].includes(body.priority))throw new AppError(422,'Choose a valid priority.');
 const note=typeof body.note==='string'?body.note.trim():'';if(note.length>500)throw new AppError(422,'Plan note must not exceed 500 characters.');
 if(!await db.prepare('SELECT id FROM recipes WHERE id=?').bind(recipe).first())throw new AppError(422,'Choose a valid recipe.');
 await db.prepare('INSERT INTO production_plans (id,recipe_id,target_qty,due_date,priority,status,note,created_by,created_at) VALUES (?,?,?,?,?,?,?,?,?)').bind(crypto.randomUUID(),recipe,qty,date,body.priority,'PLANNED',note,user.id,new Date().toISOString()).run();
 return plans(db,user);
}
export async function updatePlan(db:D1Database,user:Actor,id:string,body:any){
 requireRole(user,'cutting_supervisor');const revision=integer(body.revision,'Revision');
 if(!['PLANNED','SCHEDULED','CANCELLED'].includes(body.status))throw new AppError(422,'Invalid plan status.');
 const result=await db.prepare('UPDATE production_plans SET status=?,revision=revision+1 WHERE id=? AND revision=?').bind(body.status,id,revision).run();
 if(!result.meta.changes)throw new AppError(409,'Plan changed or no longer exists. Refresh and try again.');
 return plans(db,user);
}
