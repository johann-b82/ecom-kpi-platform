import { pool } from '../src/lib/db';
import {
  PRODUCTS, PROMOTIONS, GOODIES, COMPETITORS, NOTIFICATIONS, INTEGRATIONS,
} from '../src/brickpm/seed-data';

export async function seedBrickpm(): Promise<void> {
  for (const p of PRODUCTS) {
    await pool.query(
      `INSERT INTO bpm_products (id,name,cat,series,status,year,parts,uvp,price,cost,t_mgn,m_mgn,stock,min_stock,valid_from,valid_to,channel,succ,descr)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
       ON CONFLICT (id) DO UPDATE SET name=excluded.name,cat=excluded.cat,series=excluded.series,status=excluded.status,
         year=excluded.year,parts=excluded.parts,uvp=excluded.uvp,price=excluded.price,cost=excluded.cost,
         t_mgn=excluded.t_mgn,m_mgn=excluded.m_mgn,stock=excluded.stock,min_stock=excluded.min_stock,
         valid_from=excluded.valid_from,valid_to=excluded.valid_to,channel=excluded.channel,succ=excluded.succ,descr=excluded.descr`,
      [p.id,p.name,p.cat,p.series,p.status,p.year,p.parts,p.uvp,p.price,p.cost,p.tMgn,p.mMgn,p.stock,p.minStock,p.validFrom,p.validTo,p.channel,p.succ,p.descr],
    );
  }
  for (const a of PROMOTIONS) {
    await pool.query(
      `INSERT INTO bpm_promotions (id,name,product_id,type,start_date,end_date,target_units,sold,target_rev,exp_mgn,status,note)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       ON CONFLICT (id) DO UPDATE SET name=excluded.name,product_id=excluded.product_id,type=excluded.type,
         start_date=excluded.start_date,end_date=excluded.end_date,target_units=excluded.target_units,sold=excluded.sold,
         target_rev=excluded.target_rev,exp_mgn=excluded.exp_mgn,status=excluded.status,note=excluded.note`,
      [a.id,a.name,a.productId,a.type,a.startDate,a.endDate,a.targetUnits,a.sold,a.targetRev,a.expMgn,a.status,a.note],
    );
  }
  for (const g of GOODIES) {
    await pool.query(
      `INSERT INTO bpm_goodies (id,name,type,cost,price,products,min_cart,valid_from,valid_to,status,mgn_effect,comment)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       ON CONFLICT (id) DO UPDATE SET name=excluded.name,type=excluded.type,cost=excluded.cost,price=excluded.price,
         products=excluded.products,min_cart=excluded.min_cart,valid_from=excluded.valid_from,valid_to=excluded.valid_to,
         status=excluded.status,mgn_effect=excluded.mgn_effect,comment=excluded.comment`,
      [g.id,g.name,g.type,g.cost,g.price,g.products,g.minCart,g.validFrom,g.validTo,g.status,g.mgnEffect,g.comment],
    );
  }
  for (const c of COMPETITORS) {
    await pool.query(
      `INSERT INTO bpm_competitors (id,product_id,competitor,comp_product,own_price,comp_price,avail,date,rec)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (id) DO UPDATE SET product_id=excluded.product_id,competitor=excluded.competitor,comp_product=excluded.comp_product,
         own_price=excluded.own_price,comp_price=excluded.comp_price,avail=excluded.avail,date=excluded.date,rec=excluded.rec`,
      [c.id,c.productId,c.competitor,c.compProduct,c.ownPrice,c.compPrice,c.avail,c.date,c.rec],
    );
  }
  for (const n of NOTIFICATIONS) {
    await pool.query(
      `INSERT INTO bpm_notifications (id,type,priority,ref_id,msg,action,status,due,role,target)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       ON CONFLICT (id) DO UPDATE SET type=excluded.type,priority=excluded.priority,ref_id=excluded.ref_id,msg=excluded.msg,
         action=excluded.action,status=excluded.status,due=excluded.due,role=excluded.role,target=excluded.target`,
      [n.id,n.type,n.priority,n.refId,n.msg,n.action,n.status,n.due,n.role,n.target],
    );
  }
  for (const i of INTEGRATIONS) {
    await pool.query(
      `INSERT INTO bpm_integrations (id,type,system,purpose,objects,dir,status,ep,last_sync)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (id) DO UPDATE SET type=excluded.type,system=excluded.system,purpose=excluded.purpose,objects=excluded.objects,
         dir=excluded.dir,status=excluded.status,ep=excluded.ep,last_sync=excluded.last_sync`,
      [i.id,i.type,i.system,i.purpose,i.objects,i.dir,i.status,i.ep,i.lastSync],
    );
  }
  console.log('BrickPM seed applied.');
}

if (process.argv[1] && process.argv[1].endsWith('seed-brickpm.ts')) {
  seedBrickpm().then(() => pool.end()).catch((err) => { console.error(err); process.exit(1); });
}
