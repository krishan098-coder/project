export const productionCatalog = [
 {id:'blouse',code:'REC-BL01',name:'Casual Blouse',category:'Blouse',fabric:1.8,cap:5,parts:[['Front Body Panel',1],['Back Body Panel',1],['Sleeves (Left & Right)',2],['Collar & Stand',1],['Sleeve Cuffs',2]]},
 {id:'crop',code:'REC-CT02',name:'Crop Top',category:'Crop Top',fabric:1.1,cap:8,parts:[['Front Chest Panel',1],['Back Support Panel',1],['Neck Binding Strip',1],['Hem Elastic Casing',1],['Side Strap Accents',2]]},
 {id:'tee',code:'REC-TS03',name:'Essential T-Shirt',category:'Everyday basics',fabric:1.3,cap:5,parts:[['Front Body',1],['Back Body',1],['Short Sleeves',2],['Rib Neckband',1]]},
 {id:'polo',code:'REC-PL04',name:'Signature Polo',category:'Smart casual',fabric:1.6,cap:6,parts:[['Front Body',1],['Back Body',1],['Short Sleeves',2],['Rib Collar',1],['Sleeve Ribs',2],['Placket Panels',2]]},
 {id:'shirt',code:'REC-SH05',name:'Oxford Shirt',category:'Shirting',fabric:2.2,cap:6,parts:[['Front Panels',2],['Back Body',1],['Back Yoke',2],['Long Sleeves',2],['Collar Pieces',2],['Collar Stand Pieces',2],['Cuffs',4],['Chest Pocket',1]]},
 {id:'hoodie',code:'REC-HD06',name:'Everyday Hoodie',category:'Layering',fabric:2.8,cap:8,parts:[['Front Body',1],['Back Body',1],['Long Sleeves',2],['Hood Panels',2],['Kangaroo Pocket',1],['Rib Cuffs',2],['Rib Waistband',1]]},
 {id:'trouser',code:'REC-TR07',name:'Tailored Trousers',category:'Bottoms',fabric:2.4,cap:7,parts:[['Front Legs',2],['Back Legs',2],['Waistband',1],['Pocket Bags',4],['Fly Panels',2],['Belt Loops',6]]},
 {id:'jacket',code:'REC-JK08',name:'Track Jacket',category:'Activewear',fabric:2.5,cap:8,parts:[['Front Panels',2],['Back Body',1],['Long Sleeves',2],['Stand Collar',2],['Pocket Panels',2],['Cuffs',2],['Hem Band',1]]}
] as const;
export async function ensureCatalog(db:D1Database) {
 const statements:D1PreparedStatement[]=[];
 for(const recipe of productionCatalog){
  statements.push(db.prepare('INSERT OR IGNORE INTO recipes VALUES (?,?,?,?,?,?)').bind(recipe.id,recipe.code,recipe.name,recipe.category,recipe.fabric,recipe.cap));
  recipe.parts.forEach(([name,quantity],index)=>statements.push(db.prepare('INSERT OR IGNORE INTO recipe_components (id,recipe_id,component_name,pieces_per_garment) VALUES (?,?,?,?)').bind(`${recipe.id}-${index}`,recipe.id,name,quantity)));
 }
 await db.batch(statements);
}
