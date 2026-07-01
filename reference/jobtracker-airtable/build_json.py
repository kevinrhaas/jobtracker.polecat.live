import json, datetime
d=json.load(open('jobtracker_raw.json'))
ar=d['appRead']; t=ar['data']['tableSchemas'][0]
cols=t['columns']
colById={c['id']:c for c in cols}
primary=t.get('primaryColumnId')

# option maps for select/multiSelect
def choices(c):
    to=c.get('typeOptions') or {}
    ch=to.get('choices') or {}
    return {k:v.get('name') for k,v in ch.items()}
optmaps={c['id']:choices(c) for c in cols if c['type'] in ('select','multiSelect')}

def fmt_date(v):
    if not v: return v
    try:
        s=v.replace('Z','+00:00'); dt=datetime.datetime.fromisoformat(s)
        return dt.strftime('%Y-%m-%d')
    except Exception: return v

def rich_to_text(v):
    if isinstance(v,str): return v
    if isinstance(v,dict):
        # documentValue or similar
        def walk(node):
            if isinstance(node,dict):
                if 'insert' in node and isinstance(node['insert'],str): return node['insert']
                return ''.join(walk(x) for x in node.values())
            if isinstance(node,list): return ''.join(walk(x) for x in node)
            return ''
        return walk(v).strip()
    return v

def cell(cid,val):
    c=colById[cid]; typ=c['type']
    if val is None: return None
    if typ=='select':
        return optmaps[cid].get(val,val)
    if typ=='multiSelect':
        return [optmaps[cid].get(x,x) for x in val]
    if typ=='date':
        return fmt_date(val)
    if typ=='richText':
        return rich_to_text(val)
    if typ=='multipleAttachment':
        return [{'filename':a.get('filename'),'type':a.get('type'),'size':a.get('size'),'id':a.get('id'),'url':a.get('url')} for a in val]
    return val

# fields metadata
fields=[]
for c in cols:
    f={'id':c['id'],'name':c['name'],'type':c['type'],'isPrimary':c['id']==primary}
    if c['id'] in optmaps:
        f['choices']=list(optmaps[c['id']].values())
    fields.append(f)

# records
records=[]
for r in d['tableData']['data']['rows']:
    cv=r.get('cellValuesByColumnId') or {}
    fv={}
    for c in cols:
        v=cv.get(c['id'])
        hv=cell(c['id'],v) if v is not None else None
        fv[c['name']]=hv
    records.append({'recordId':r['id'],'createdTime':r.get('createdTime'),'fields':fv})

# Creative Status filter resolved
status_col='fld4ytfU1xVT1iAkF'  # Project Status
ptype_col='fld5nzxTy2GwZi2Ln'   # Project Type
cs_status=[optmaps[status_col].get(x,x) for x in ['seljNOGZAVp8NI2vl','selC0cefHtCtDLEwW','selUq4QtxrvdafDhS']]
cs_ptype=[optmaps[ptype_col].get(x,x) for x in ['selwJTPopOBATNNNC','selSZ1j6itj30mIaP','selWU7QUfFJ1Z3xtB']]

cs_visible=["Project ID","Project ID Letter","Internal Client","Project Name","Division Code","Date In","Due Date","Designer Name","Project Status","Comments","Related Documents","Total Deliverables","Vendor","Date Completed","Rush"]

views=[
 {'id':'viwyVPqgZvjgwwLBV','name':'Full List View','type':'grid',
  'visibleColumns':[c['name'] for c in cols],'filter':None,'sort':None,'group':None,
  'description':'Shows all records and all fields.'},
 {'id':'viwobdjEaFpEm3Waw','name':'Creative Status','type':'grid',
  'visibleColumns':cs_visible,
  'hiddenColumns':[c['name'] for c in cols if c['name'] not in cs_visible],
  'filter':{'conjunction':'and','conditions':[
     {'field':'Project Status','operator':'is any of','values':cs_status},
     {'field':'Project Type','operator':'is any of','values':cs_ptype}]},
  'sort':None,'group':None,
  'description':'Filtered to active creative work: Project Status in %s AND Project Type in %s.'%(cs_status,cs_ptype)}
]

out={
 'source':'Airtable base JobTracker2.0.xlsx',
 'baseId':'appBhb42sEosIY7ie',
 'table':{'id':t['id'],'name':t['name'],'description':t.get('description'),'primaryField':colById[primary]['name'],'recordCount':len(records)},
 'fields':fields,
 'views':views,
 'records':records
}
json.dump(out,open('jobtracker_data.json','w'),indent=2,ensure_ascii=False)
print('records:',len(records),'fields:',len(fields))
print('CS filter status:',cs_status)
print('CS filter ptype:',cs_ptype)
# quick peek
print(json.dumps(records[0]['fields'],ensure_ascii=False)[:300])
