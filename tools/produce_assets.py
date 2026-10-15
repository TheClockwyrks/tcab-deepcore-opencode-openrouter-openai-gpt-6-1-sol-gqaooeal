"""One-time original asset authoring. Never called by the application build."""
import json, math, random, subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TMP = Path('/tmp/opencode')
random.seed(3847)

def run(*args):
    result = subprocess.run([str(a) for a in args], capture_output=True, text=True)
    if result.returncode:
        raise RuntimeError(result.stderr + result.stdout)

ops = []
def rect(x,y,w,h,c):
    ops.append(dict(op='fill_rect',x=int(x),y=int(y),width=max(1,int(w)),height=max(1,int(h)),color=c))
def circle(x,y,r,c):
    ops.append(dict(op='fill_circle',cx=int(x),cy=int(y),r=int(r),color=c))
def line(x,y,x2,y2,c):
    ops.append(dict(op='line',x0=int(x),y0=int(y),x1=int(x2),y1=int(y2),color=c))
def save(path,w=80,h=80,sheet=False):
    out=ROOT/'assets'/path
    out.parent.mkdir(parents=True,exist_ok=True)
    action=TMP/'art.json'
    action.write_text(json.dumps(ops))
    run('draw-sheet' if sheet else 'draw','render','--actions',action,'--out',out,'--width',w,'--height',h,'--no-layers','--layer-document',TMP/'layers.json')
    ops.clear()

palettes=[('#554538','#655342','#392f2b','#79624b'),('#424d51','#535f62','#303b41','#697274'),('#292e3d','#353c4b','#1d2230','#485063'),('#493136','#603b3b','#30262e','#805044')]
bands=['topsoil','rockbed','deepstone','coreshell']
for band,p in zip(bands,palettes):
    for n in range(3):
        rect(0,0,80,80,p[0])
        for i in range(1100):
            x,y=random.randrange(80),random.randrange(80)
            rect(x,y,random.choice([1,1,2,3]),1,random.choice(p))
        for i in range(10):
            x,y=random.randrange(80),random.randrange(80)
            line(x,y,x+random.randrange(3,13),y+random.randrange(-3,4),p[2])
        save(f'tiles/{band}-{n}.png')
for name,base in [('bedrock','#202c36'),('tunnel','#151c22')]:
    rect(0,0,80,80,base)
    for i in range(650):
        rect(random.randrange(80),random.randrange(80),1,1,random.choice(['#ffffff05','#00000022','#81929a0b']))
    save(f'tiles/{name}.png')
for n in range(2):
    rect(0,0,80,80,'#343c43')
    for y in range(8,73):
        inset=int(8+9*abs(math.sin(y*.045+n)))
        rect(inset,y,80-inset*2,1,'#73808a' if y<35 else '#505e69')
    line(24,17,60,29,'#a7b9c3');line(18,48,56,62,'#283640')
    for i in range(20):
        x,y=random.randrange(18,62),random.randrange(15,65)
        rect(x,y,3,1,'#9cabb366')
    save(f'tiles/stone-{n}.png')
colors=['#b4a087','#dcc36e','#dc8559','#c7dce2','#629ddd','#89ddc8','#b6c48e','#f6aa62','#da7076','#c6abe5','#8fe6ae','#f2a3c6','#ffe49a']
names=['ferron','marlite','cuprite','argenite','cobaltine','voltite','halcite','pyronium','cindrite','adamite','verdite','roselite','aurite']
for i,(name,color) in enumerate(zip(names,colors)):
    if i<10:
        for j in range(280):
            x=random.randrange(80); center=40+12*math.sin(x*.06+i)
            y=int(random.gauss(center,8))
            rect(x,y,random.randrange(1,7),random.randrange(1,4),color+random.choice(['55','88','bb','ff']))
        for x in range(0,80,4):
            rect(x,int(39+12*math.sin(x*.06+i)),5,2,'#f4eadfaa')
    else:
        for y in range(18,65):
            half=int((y-18)*1.1 if y<34 else (65-y)*.8)
            rect(40-half,y,half*2,1,color)
            rect(40,y,half,1,'#ffffff44')
        line(19,34,61,34,'#f7ffff');line(40,19,30,34,'#ffffff');line(30,34,40,64,'#365c69')
        line(57,19,57,31,'#ffffff');line(51,25,63,25,'#ffffff')
    save(f'ore/{name}.png')
for name,c in [('resonite','#82e6cf'),('cryenite','#ab9af4'),('core','#ff8860'),('core-sample','#ffc96a')]:
    for x,y,r in [(37,42,24),(25,49,15),(54,48,18)]:
        for yy in range(y-r,y+r):
            half=max(1,int((r-abs(y-yy))*.55))
            rect(x-half,yy,half*2,1,c)
            rect(x,yy,half,1,'#ffffff55')
        line(x,y-r,x,y+r,'#ffffff88')
    for x,y in [(12,20),(62,17),(68,62)]:
        line(x-3,y,x+3,y,c);line(x,y-3,x,y+3,c)
    save(f'materials/{name}.png')
for frame in range(4):
    for j in range(frame+2):
        x,y=40,40
        for k in range(3+frame):
            nx=x+random.randrange(-18,19);ny=y+random.randrange(-17,18)
            line(x,y,nx,ny,'#11151dd0');line(x+1,y,nx+1,ny,'#d7ba8b55');x,y=nx,ny
    save(f'tiles/crack/frame{frame:02}.png',sheet=True)
for frame in range(3):
    rect(0,0,80,80,'#bb482e')
    for y in range(80):
        for x in range(0,80,2):
            v=math.sin(x*.09+y*.12+frame*2)+math.sin(y*.2-x*.08)
            if v>.6:rect(x,y,2,1,'#ffb450' if v<1.4 else '#ffe297')
    save(f'hazards/lava/frame{frame:02}.png',sheet=True)

# A pressure suit with a gold ceramic helmet, cyan glass, separate drill and pack.
states={'idle':4,'walk':6,'drill-down':4,'drill-side':4,'jetpack':4,'fall':3,'hurt':3,'fuel-out':3}
for state,frames in states.items():
    for f in range(frames):
        bob=[0,1,0,-1][f%4]; lean=3 if state=='hurt' else 0
        by=30+bob+(4 if state in ['drill-down','fuel-out'] else 0)
        leg=round(math.sin(f*math.pi/3)*5) if state=='walk' else (4 if state=='fall' else 0)
        rect(13+lean,by+1,16,29,'#101d29');rect(15+lean,by+3,11,23,'#627e89');rect(14+lean,by+8,3,13,'#b5d0ce')
        rect(17+lean,by+26,8,8,'#263744')
        if state=='jetpack':
            for k in range(14+f%3*3):
                rect(18-k//6,by+34+k,7+k//3,1,'#f7ae52' if k>6 else '#b9ffff')
        for lx,dy in [(29,-leg),(43,leg)]:
            rect(lx,by+24,10,16+dy,'#263d4a');rect(lx,by+26,7,7,'#9aafa9');rect(lx-2,by+39+dy,15,6,'#111d28');rect(lx,by+39+dy,12,2,'#bac8bb')
        rect(26+lean,by,29,31,'#172c39');rect(29+lean,by+2,24,23,'#d4b679');rect(29+lean,by+14,24,7,'#9c7953');rect(35+lean,by+4,9,7,'#e7ddd0')
        rect(28+lean,by+24,26,5,'#415966');rect(43+lean,by+24,5,5,'#73ded4')
        circle(40+lean,by-9,19,'#162631');circle(40+lean,by-10,16,'#dbb779');rect(31+lean,by-19,25,15,'#1c3e51');rect(33+lean,by-17,19,8,'#74c5c9');rect(34+lean,by-17,14,3,'#c5f2df');rect(53+lean,by-16,7,8,'#fff1b3' if f%2 else '#d4dfb1');rect(23+lean,by-9,7,9,'#8f7250')
        if state=='drill-down':
            rect(48,by+15,12,21,'#7b959e');rect(51,by+33,7,12,'#c7d3cf')
            for j in range(4):rect(49+j,by+45+j*2,11-j*2,2,'#9bb6b8')
        else:
            armY=by+10-(5 if state=='fall' else 0)
            rect(48,armY,14,10,'#cfac74');rect(55,armY+5,11,9,'#233c4a');rect(57,armY+7,14,9,'#6a8a94')
            for j in range(4):rect(69+j*2,armY+7+j,2,9-j*2,'#d3d9c9' if (j+f)%2 else '#6b8086')
        if state=='hurt':line(25,14+f,49,8+f,'#ffd4bc')
        save(f'miner/{state}/frame{f:02}.png',sheet=True)

buildings=['fuel-depot','ore-market','save-pad','upgrade-shop','supply-depot','launch-pad']
for index,name in enumerate(buildings):
    accent=['#e7b46e','#8cd4c3','#99c9db','#a5a0d4','#d1c59a','#dd9a76'][index]
    rect(3,106,194,14,'#182b36');rect(10,101,181,5,'#7b8c88')
    if name=='launch-pad':
        for x in [17,161]:
            rect(x,9,9,94,'#586d77');line(x,10,x+35,100,'#2f4654')
        rect(13,13,155,6,'#a6a191');rect(58,91,88,11,'#687c81')
    elif name=='save-pad':
        rect(45,78,112,23,'#3c5965');rect(58,73,86,5,accent);rect(90,28,22,46,'#1f3544');rect(79,20,45,31,'#5d7e86');rect(85,25,33,18,'#9be6d0');rect(89,31,24,3,'#29485c')
    else:
        rect(18,45,164,57,'#223b49');rect(25,38,151,9,'#87948c');rect(33,21,128,21,'#314e5c');rect(36,23,122,3,accent)
        for x in range(27,176,10):rect(x,51,2,45,'#3a525b')
        rect(79,59,39,42,'#112631');rect(82,62,31,32,'#4b737b');rect(105,76,4,4,accent)
        rect(34,58,31,23,'#102a37');rect(38,62,23,14,accent);rect(132,59,32,23,'#102a37');rect(136,63,24,3,accent)
        for y in range(70,80,4):rect(136,y,17,2,'#5e8688')
        if index==0:
            rect(6,62,18,39,'#a18a67');rect(8,65,14,12,accent);line(23,69,30,85,'#b6c9ba')
            for tx in [126,148]:
                circle(tx,46,10,'#94a5a2');rect(tx-10,45,20,50,'#788985');rect(tx-8,52,5,37,'#b8c0ac');rect(tx-10,67,20,4,accent)
        if index==1:
            rect(19,8,7,33,'#788f94');rect(20,8,64,6,'#9caa9c');line(26,17,72,17,accent);line(72,13,72,45,'#b9c8b7');rect(67,43,10,4,accent)
            for x in range(8,70,12):circle(x,99,4,'#778c8c')
            rect(5,91,64,5,'#998c69');rect(12,82,14,9,'#bfaa75');rect(36,79,16,12,'#9e9276')
        if index==3:
            line(53,6,53,21,accent);circle(53,6,5,accent)
            circle(149,71,15,'#76909a');circle(149,71,9,'#263c49');rect(146,48,6,45,'#b0b8ab');rect(127,68,45,6,'#a9b5a9');circle(149,71,5,accent)
        if index==4:
            for x,y in [(5,84),(24,84),(14,68),(143,86),(162,86)]:
                rect(x,y,17,16,'#8c8b6e');rect(x+2,y+2,13,12,'#b4a67c');line(x+2,y+2,x+14,y+12,'#796f51');line(x+14,y+2,x+2,y+12,'#796f51')
        for x in [23,169]:rect(x,90,9,12,'#b0a68a')
    save(f'surface/{name}.png',200,120)
rect(0,0,80,80,'#414742');rect(0,0,80,9,'#a19575');rect(0,10,80,4,'#252f31')
for i in range(300):rect(random.randrange(80),random.randrange(16,80),2,1,random.choice(['#6b6954','#333c38']))
save('surface/ground.png')
rect(0,0,160,120,'#1b2a32');circle(80,88,54,'#101e28');rect(34,88,92,32,'#101e28')
for x in [22,130]:rect(x,22,8,98,'#75817b');rect(x,25,8,8,'#edc37d')
rect(20,18,120,8,'#9d967d');save('surface/cave-mouth.png',160,120)
# Designed sky: layered ridgelines, sparse stars, dusty moon and derelict silhouettes.
rect(0,0,1280,664,'#101e29')
for y in range(664):rect(0,y,1280,1,f'#{16+int(y*.012):02x}{29+int(y*.016):02x}{40+int(y*.012):02x}')
for i in range(220):
    x,y=random.randrange(1280),random.randrange(450);rect(x,y,1 if i%5 else 2,1,random.choice(['#78969b','#4b626e','#c6c8ae']))
circle(1005,153,69,'#78857d');circle(982,138,69,'#1a2c36')
for layer,color in [(0,'#263942'),(1,'#20333c'),(2,'#192c35')]:
    points=[random.randrange(360+layer*55,510+layer*35) for _ in range(18)]
    for x in range(1280):
        i=min(16,x//76); t=(x%76)/76; yy=points[i]*(1-t)+points[i+1]*t
        rect(x,yy,1,664-yy,color)
save('surface/sky.png',1280,664)
for stage in range(6):
    rect(12,211,136,13,'#52666d');rect(20,207,120,4,'#b9a88b')
    if stage:
        rect(57,72,47,132,'#253e4b');rect(61,76,39,124,'#b3bdb3');rect(66,78,8,119,'#dfd9bb');rect(89,76,11,124,'#738c8e')
        for y in range(83,196,20):rect(58,y,45,3,'#4b646c')
    if stage>=2:
        for x in [42,101]:rect(x,119,16,81,'#a89b80');rect(x+3,121,4,71,'#d9cdab')
    if stage>=3:
        for y in range(34,74):rect(80-(y-34)*.59,y,max(1,(y-34)*1.18),1,'#d4cbb1')
        circle(81,91,12,'#1d3c4b');circle(81,91,8,'#9bd7cf')
    if stage>=4:
        for y in range(163,207):rect(32+(207-y)*.5,y,22,1,'#ac7d60');rect(106,y,22-(207-y)*.4,1,'#d4a57b')
        rect(65,199,32,12,'#2b414b')
    if stage>=5:rect(57,136,46,10,'#d19b63');rect(70,137,20,5,'#f2d4a1')
    save(f'rocket/stage{stage}.png',160,224)
for i,name in enumerate(['fuel','hull','cargo','credits','depth','resonite','cryenite','core-sample']):
    c=['#eac47e','#dba08e','#b0c9bc','#e8ce91','#a6c8d0','#87dbc5','#bba8ec','#f2ad70'][i]
    if name=='fuel':rect(6,6,11,15,c);rect(9,3,5,4,c);rect(8,9,7,6,'#1c313c')
    elif name=='hull':
        for y in range(4,21):rect(12-int((22-y)*.42),y,max(1,int((22-y)*.84)),1,c)
    elif name=='cargo':rect(4,7,17,14,c);rect(6,9,13,10,'#213741');line(12,8,12,20,c);rect(7,3,11,3,c)
    elif name=='credits':circle(12,12,9,c);circle(12,12,6,'#243e47');rect(10,7,5,2,c);rect(9,10,5,2,c);rect(11,13,5,2,c)
    elif name=='depth':line(12,3,12,19,c);line(7,14,12,20,c);line(12,20,17,14,c)
    else:
        for y in range(3,22):
            half=max(1,int((9-abs(12-y))*.65));rect(12-half,y,half*2,1,c);rect(12,y,half,1,'#ffffff55')
    save(f'icons/{name}.png',24,24)

effects=['gas-seep','drill-debris','jetpack-exhaust','ore-sparkle','material-shimmer','gas-explosion','lava-embers','impact-dust','core-extract','core-detonation','launch-exhaust','death-burst']
for i,name in enumerate(effects):
    cfg=TMP/'fx.json';out=ROOT/'assets/fx'/f'{name}.json';out.parent.mkdir(exist_ok=True)
    cfg.write_text(json.dumps(dict(width=256,height=256,duration_ms=1800,fps=24,seed=42+i,actions=str(TMP/'fx-actions.json'),preview=str(TMP/'fx.png'),system=str(out))))
    run('particle-2d','--config',cfg,'init')
    blast='explosion' in name or 'detonation' in name
    # Count, lifetime, speed, radius, opacity, palette: each authored system has
    # its own silhouette and timing, not a renamed copy of a generic burst.
    count,life,speed,size,opacity,color={
        'gas-seep':(9,1700,14,1.2,.16,'#b7c9b3'),
        'drill-debris':(18,480,130,.65,.9,'#b7a282'),
        'jetpack-exhaust':(80,320,190,1.2,.8,'#ffd18b'),
        'ore-sparkle':(16,450,90,.75,1,'#ffe5ad'),
        'material-shimmer':(55,1100,78,1.1,.9,'#91f2d8'),
        'gas-explosion':(130,800,240,1.8,.95,'#ffc377'),
        'lava-embers':(32,520,120,.45,.95,'#ff904b'),
        'impact-dust':(30,850,115,2,.45,'#c9b89b'),
        'core-extract':(64,1500,80,1.7,.9,'#f8b5e3'),
        'core-detonation':(240,1400,330,3,.95,'#fff3b4'),
        'launch-exhaust':(160,1200,260,3,.8,'#ffce86'),
        'death-burst':(55,1000,160,.8,.8,'#bad8d1'),
    }[name]
    run('particle-2d','--config',cfg,'add-emitter','--name','primary','--shape','disc','--x',128,'--y',128,'--radius',20 if i==0 else 8,'--rate' if i in [2,10] else '--burst',count,'--lifetime',life,'--lifetime-spread',life*.2,'--speed',speed,'--speed-spread',speed*.25,'--cone-angle',180 if blast or i in [3,4,8,11] else 18 if i in [2,10] else 65,'--dir-y',-1 if i in [2,10] else 1)
    run('particle-2d','--config',cfg,'set-particle','--emitter','primary','--size-from',size,'--size-to',2 if i==0 else .05,'--opacity-from',opacity,'--opacity-to',0,'--color-gradient',f'{color}@0,#58656b@1')
    run('particle-2d','--config',cfg,'set-forces','--gravity',-160 if i in [1,7,11] else 10,'--drag',1.2,'--turbulence','15,0.08')
    if blast:
        run('particle-2d','--config',cfg,'add-emitter','--name','flash','--shape','point','--x',128,'--y',128,'--burst',1,'--lifetime',240,'--speed',0)
        run('particle-2d','--config',cfg,'set-particle','--emitter','flash','--size-from',10,'--size-to',25,'--opacity-from',1,'--opacity-to',0,'--color-gradient','#ffefbe@0,#f97d46@1')
    if blast or i in [4,8]:
        run('particle-2d','--config',cfg,'add-emitter','--name','shockwave','--shape','disc','--x',128,'--y',128,'--radius',4,'--burst',65 if blast else 32,'--lifetime',350 if blast else 850,'--speed',350 if blast else 125,'--cone-angle',180)
        run('particle-2d','--config',cfg,'set-particle','--emitter','shockwave','--size-from',.8,'--size-to',.05,'--opacity-from',.85,'--opacity-to',0,'--color-gradient',f'{color}@0,#839b9c@1')
    if i==10:
        run('particle-2d','--config',cfg,'add-emitter','--name','smoke','--shape','disc','--x',128,'--y',128,'--radius',12,'--rate',35,'--lifetime',1600,'--speed',100,'--dir-y',-1,'--cone-angle',35)
        run('particle-2d','--config',cfg,'set-particle','--emitter','smoke','--size-from',2,'--size-to',6,'--opacity-from',.35,'--opacity-to',0,'--color-gradient','#d1c6ac@0,#465660@1')
    run('particle-2d','--config',cfg,'render','--frame',12,'--out',TMP/'fx.png')

cues=['drill','thrust','ore-pickup','material-chime','gas-explosion','lava-sizzle','impact','fabricate','launch','death','alarm-fuel','alarm-core']
for i,name in enumerate(cues):
    cfg=TMP/'sfx.json';out=ROOT/'assets/audio'/f'{name}.wav';out.parent.mkdir(exist_ok=True)
    cfg.write_text(json.dumps(dict(sample_rate=22050,channels='mono',max_duration_ms=2500,seed=50+i,actions=str(TMP/'sfx-actions.json'),preview=str(TMP/'sfx.png'),wav=str(out))))
    tool='sfx-sample' if i in [2,3,4,6,7,9] else 'sfx-synth'
    run(tool,'--config',cfg,'init')
    mechanical=i in [0,1,4,5,6,8,9]
    run(tool,'--config',cfg,'add-voice','--name','body','--wave','noise' if mechanical else 'sine','--freq',80 if mechanical else 440+i*47,'--gain',-29 if i<2 else -21,'--dur',900 if mechanical else 230)
    run(tool,'--config',cfg,'add-voice','--name','tone','--wave','triangle','--freq',65 if mechanical else 660+i*38,'--gain',-28,'--start',40,'--dur',700 if mechanical else 350)
    run(tool,'--config',cfg,'set-pitch','--voice','tone','--slide-to',35 if mechanical else 1100,'--over',500)
    run(tool,'--config',cfg,'set-envelope','--voice','body','--env','gate' if i in [0,1] else 'punch' if mechanical else 'pluck')
    if mechanical:run(tool,'--config',cfg,'add-filter','--voice','body','--type','lowpass','--cutoff',1500 if i<2 else 4000,'--sweep-to',500,'--over',700)
    if tool=='sfx-sample':
        sample={2:'mech_clip_load',3:'zap_electric',4:'cannon_body_heavy',6:'impact_metal_dry',7:'mech_ratchet',9:'boom_sub_rumble'}[i]
        run(tool,'--config',cfg,'add-sample','--name',sample,'--t',0,'--gain',-17,'--fade-out',120)
    run(tool,'--config',cfg,'render')
cfg=TMP/'music.json'
cfg.write_text(json.dumps(dict(sample_rate=22050,channels='mono',max_duration_ms=24000,seed=83,actions=str(TMP/'music-actions.json'),preview=str(TMP/'music.png'),wav=str(ROOT/'assets/audio/music.wav'),mid=str(ROOT/'assets/audio/music.mid'))))
run('music','--config',cfg,'init');run('music','--config',cfg,'set-tempo','--bpm',80)
for name,instrument in [('drone','synth_pad'),('echo','vibraphone')]:
    run('music','--config',cfg,'define-track','--name',name,'--instrument',instrument)
    run('music','--config',cfg,'set-track-fx','--track',name,'--gain',-12,'--reverb',.45,'--env','swell' if name=='drone' else 'pluck')
for b in range(0,32,4):
    run('music','--config',cfg,'add-note','--track','drone','--pitch',[38,34,41,36][b//8],'--t',b,'--dur',4,'--velocity',36)
    for k,pitch in enumerate([62,69,65,57]):run('music','--config',cfg,'add-note','--track','echo','--pitch',pitch-(2 if b>=16 else 0),'--t',b+k,'--dur',.65,'--velocity',25)
run('music','--config',cfg,'render')
print('Original assets rendered.')
