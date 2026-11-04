INSERT INTO metrics(id,code,name,unit,kind,direction,owner,definition,personal,purpose,review_on,reviewed_at) VALUES
 ('10000000-0000-4000-8000-000000000001','SALES','Net sales','NZD','sum','higher','Aroha','Invoice value excluding tax and credit notes',false,'',current_date+30,now()),
 ('10000000-0000-4000-8000-000000000002','ONTIME','On-time dispatch','percent','ratio','higher','Ben','Orders dispatched by agreed date / dispatched orders',false,'',current_date-7,now()-interval '60 days'),
 ('10000000-0000-4000-8000-000000000003','RETURNS','Customer returns','count','sum','lower','Aroha','Returned orders by return month',false,'',current_date+30,now()),
 ('10000000-0000-4000-8000-000000000004','OVERTIME','Overtime hours','hours','sum','lower','Moana','Recorded overtime by team, no individual names',true,'',NULL,NULL),
 ('10000000-0000-4000-8000-000000000005','BACKLOG','Order backlog','count','sum','lower','Ben','Open orders at month end',false,'',current_date+30,now())
ON CONFLICT DO NOTHING;
INSERT INTO observations(metric_id,period,segment,numerator,denominator,source,row_key,evidence)
SELECT ('10000000-0000-4000-8000-'||lpad(m::text,12,'0'))::uuid,(date_trunc('month',current_date)-months*interval '1 month')::date,segment,n,d,'synthetic-demo',key,'Synthetic example, not customer data'
FROM (VALUES
 (1,2,'North',100000::numeric,NULL::numeric,'sales-n-2'),(1,1,'North',85000,NULL,'sales-n-1'),
 (1,2,'South',70000,NULL,'sales-s-2'),(1,1,'South',90000,NULL,'sales-s-1'),
 (2,2,'North',90,100,'dispatch-2'),(2,1,'North',8,10,'dispatch-1a'),(2,1,'North',90,100,'dispatch-1b'),
 (3,2,'North',10,NULL,'returns-2'),(3,1,'North',18,NULL,'returns-1'),
 (4,4,'Operations',44,NULL,'overtime-4')) AS d(m,months,segment,n,d,key) ON CONFLICT DO NOTHING;
INSERT INTO targets(metric_id,period,segment,value,note)
SELECT ('10000000-0000-4000-8000-'||lpad(m::text,12,'0'))::uuid,(date_trunc('month',current_date)-interval '1 month')::date,segment,value,'Synthetic agreed monthly target'
FROM (VALUES (1,'North',100000),(1,'South',80000),(2,'North',95),(3,'North',12),(5,'All',20)) AS d(m,segment,value) ON CONFLICT DO NOTHING;
INSERT INTO actions(code,metric_id,title,owner,due_on) VALUES
 ('ACT-101','10000000-0000-4000-8000-000000000001','Explain lost North sales','Aroha',current_date-3),
 ('ACT-102','10000000-0000-4000-8000-000000000002','Check late dispatch causes','Ben',current_date+3)
ON CONFLICT DO NOTHING;
