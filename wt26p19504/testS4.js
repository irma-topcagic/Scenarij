const request = require('supertest');
const expect = require('chai').expect;
const API_URL = "http://localhost:3000";

describe('Spirala 4 - Autotestovi', () => {
    let scenarioId;
    let userId1 = 1;
    let userId2 = 2;

    describe('Zadatak 1: Modeli i baza podataka', () => {
        it('treba kreirati scenario u bazi i vratiti ga sa početnom linijom', async () => {
            const res = await request(API_URL)
                .post('/api/scenarios')
                .send({ title: 'Test Scenario S4' });

            expect(res.status).to.equal(200);
            expect(res.body).to.have.property('id');
            expect(res.body).to.have.property('title', 'Test Scenario S4');
            expect(res.body).to.have.property('content');
            expect(res.body.content).to.be.an('array');
            expect(res.body.content.length).to.equal(1);
            expect(res.body.content[0]).to.have.property('lineId', 1);
            expect(res.body.content[0]).to.have.property('text', '');
            expect(res.body.content[0]).to.have.property('nextLineId', null);

            scenarioId = res.body.id;
        });

        it('treba ažurirati liniju i kreirati delta u bazi', async () => {
            await request(API_URL)
                .post(`/api/scenarios/${scenarioId}/lines/1/lock`)
                .send({ userId: userId1 });

            const res = await request(API_URL)
                .put(`/api/scenarios/${scenarioId}/lines/1`)
                .send({
                    userId: userId1,
                    newText: ['Test tekst za delta']
                });

            expect(res.status).to.equal(200);
            expect(res.body.message).to.contain('azurirana');

            const deltasRes = await request(API_URL)
                .get(`/api/scenarios/${scenarioId}/deltas`);

            expect(deltasRes.status).to.equal(200);
            expect(deltasRes.body.deltas).to.be.an('array');
            expect(deltasRes.body.deltas.length).to.be.greaterThan(0);
            
            const lineUpdateDelta = deltasRes.body.deltas.find(d => d.type === 'line_update');
            expect(lineUpdateDelta).to.exist;
            expect(lineUpdateDelta).to.have.property('lineId');
            expect(lineUpdateDelta).to.have.property('content');
            expect(lineUpdateDelta).to.have.property('timestamp');
        });

        it('treba preimenovati lika i kreirati char_rename delta u bazi', async () => {
            await request(API_URL)
                .post(`/api/scenarios/${scenarioId}/characters/lock`)
                .send({ userId: userId1, characterName: 'ALICE' });

            const res = await request(API_URL)
                .post(`/api/scenarios/${scenarioId}/characters/update`)
                .send({
                    userId: userId1,
                    oldName: 'ALICE',
                    newName: 'ALICIA'
                });

            expect(res.status).to.equal(200);

            const deltasRes = await request(API_URL)
                .get(`/api/scenarios/${scenarioId}/deltas`);

            const charRenameDelta = deltasRes.body.deltas.find(d => d.type === 'char_rename');
            expect(charRenameDelta).to.exist;
            expect(charRenameDelta).to.have.property('oldName', 'ALICE');
            expect(charRenameDelta).to.have.property('newName', 'ALICIA');
            expect(charRenameDelta).to.have.property('timestamp');
        });
    });

    describe('Zadatak 2: Checkpoint funkcionalnosti', () => {
        it('POST /api/scenarios/:scenarioId/checkpoint - treba kreirati checkpoint', async () => {
            const res = await request(API_URL)
                .post(`/api/scenarios/${scenarioId}/checkpoint`)
                .send({ userId: userId1 });

            expect(res.status).to.equal(200);
            expect(res.body).to.have.property('message', 'Checkpoint je uspjesno kreiran!');
        });

        it('POST /api/scenarios/:scenarioId/checkpoint - treba vratiti 400 ako userId nedostaje', async () => {
            const res = await request(API_URL)
                .post(`/api/scenarios/${scenarioId}/checkpoint`)
                .send({});

            expect(res.status).to.equal(400);
            expect(res.body.message).to.contain('userId is required');
        });

        it('POST /api/scenarios/:scenarioId/checkpoint - treba vratiti 404 ako scenario ne postoji', async () => {
            const res = await request(API_URL)
                .post('/api/scenarios/99999/checkpoint')
                .send({ userId: userId1 });

            expect(res.status).to.equal(404);
            expect(res.body.message).to.contain('Scenario ne postoji');
        });

        it('GET /api/scenarios/:scenarioId/checkpoints - treba vratiti listu checkpointa', async () => {
            await request(API_URL)
                .post(`/api/scenarios/${scenarioId}/checkpoint`)
                .send({ userId: userId1 });

            await new Promise(resolve => setTimeout(resolve, 1000));

            await request(API_URL)
                .post(`/api/scenarios/${scenarioId}/checkpoint`)
                .send({ userId: userId1 });

            const res = await request(API_URL)
                .get(`/api/scenarios/${scenarioId}/checkpoints`);

            expect(res.status).to.equal(200);
            expect(res.body).to.be.an('array');
            expect(res.body.length).to.be.greaterThan(0);
            
            res.body.forEach(checkpoint => {
                expect(checkpoint).to.have.property('id');
                expect(checkpoint).to.have.property('timestamp');
                expect(checkpoint.timestamp).to.be.a('number');
            });

            for (let i = 1; i < res.body.length; i++) {
                expect(res.body[i].timestamp).to.be.greaterThanOrEqual(res.body[i - 1].timestamp);
            }
        });

        it('GET /api/scenarios/:scenarioId/checkpoints - treba vratiti 404 ako scenario ne postoji', async () => {
            const res = await request(API_URL)
                .get('/api/scenarios/99999/checkpoints');

            expect(res.status).to.equal(404);
            expect(res.body.message).to.contain('Scenario ne postoji');
        });

        it('GET /api/scenarios/:scenarioId/restore/:checkpointId - treba vratiti stanje scenarija na checkpoint', async () => {
            const checkpointsRes = await request(API_URL)
                .get(`/api/scenarios/${scenarioId}/checkpoints`);

            expect(checkpointsRes.body.length).to.be.greaterThan(0);
            const firstCheckpointId = checkpointsRes.body[0].id;

            const res = await request(API_URL)
                .get(`/api/scenarios/${scenarioId}/restore/${firstCheckpointId}`);

            expect(res.status).to.equal(200);
            expect(res.body).to.have.property('id', scenarioId);
            expect(res.body).to.have.property('title');
            expect(res.body).to.have.property('content');
            expect(res.body.content).to.be.an('array');
        });

        it('GET /api/scenarios/:scenarioId/restore/:checkpointId - treba vratiti 404 ako scenario ne postoji', async () => {
            const res = await request(API_URL)
                .get('/api/scenarios/99999/restore/1');

            expect(res.status).to.equal(404);
            expect(res.body.message).to.contain('Scenario ne postoji');
        });

        it('GET /api/scenarios/:scenarioId/restore/:checkpointId - treba vratiti 404 ako checkpoint ne postoji', async () => {
            const res = await request(API_URL)
                .get(`/api/scenarios/${scenarioId}/restore/99999`);

            expect(res.status).to.equal(404);
            expect(res.body.message).to.contain('Checkpoint ne postoji');
        });

        it('GET /api/scenarios/:scenarioId/restore/:checkpointId - treba primijeniti deltas hronološki', async function() {
            this.timeout(10000);

            const newScenarioRes = await request(API_URL)
                .post('/api/scenarios')
                .send({ title: 'Restore Test Scenario' });

            const newScenarioId = newScenarioRes.body.id;

            await request(API_URL)
                .post(`/api/scenarios/${newScenarioId}/lines/1/lock`)
                .send({ userId: userId1 });

            await request(API_URL)
                .put(`/api/scenarios/${newScenarioId}/lines/1`)
                .send({
                    userId: userId1,
                    newText: ['Prva promjena']
                });

            await new Promise(resolve => setTimeout(resolve, 1100));

            const checkpoint1Res = await request(API_URL)
                .post(`/api/scenarios/${newScenarioId}/checkpoint`)
                .send({ userId: userId1 });

            expect(checkpoint1Res.status).to.equal(200);

            await request(API_URL)
                .post(`/api/scenarios/${newScenarioId}/lines/1/lock`)
                .send({ userId: userId1 });

            await request(API_URL)
                .put(`/api/scenarios/${newScenarioId}/lines/1`)
                .send({
                    userId: userId1,
                    newText: ['Druga promjena']
                });

            await new Promise(resolve => setTimeout(resolve, 1100));

            const checkpoint2Res = await request(API_URL)
                .post(`/api/scenarios/${newScenarioId}/checkpoint`)
                .send({ userId: userId1 });

            expect(checkpoint2Res.status).to.equal(200);

            const checkpointsRes = await request(API_URL)
                .get(`/api/scenarios/${newScenarioId}/checkpoints`);

            const checkpoint1Id = checkpointsRes.body[0].id;
            const checkpoint2Id = checkpointsRes.body[1].id;

            const restore1Res = await request(API_URL)
                .get(`/api/scenarios/${newScenarioId}/restore/${checkpoint1Id}`);

            const restore2Res = await request(API_URL)
                .get(`/api/scenarios/${newScenarioId}/restore/${checkpoint2Id}`);

            expect(restore1Res.status).to.equal(200);
            expect(restore2Res.status).to.equal(200);

            const line1 = restore1Res.body.content.find(l => l.lineId === 1);
            const line2 = restore2Res.body.content.find(l => l.lineId === 1);

            expect(line1).to.exist;
            expect(line2).to.exist;
        });
    });

    describe('Zadatak 3: Postojeće rute sa MySQL bazom', () => {
        it('POST /api/scenarios - treba kreirati scenario u bazi', async () => {
            const res = await request(API_URL)
                .post('/api/scenarios')
                .send({ title: 'Database Test Scenario' });

            expect(res.status).to.equal(200);
            expect(res.body).to.have.property('id');
            expect(res.body).to.have.property('title', 'Database Test Scenario');
        });

        it('GET /api/scenarios - treba vratiti sve scenarije iz baze', async () => {
            const res = await request(API_URL)
                .get('/api/scenarios');

            expect(res.status).to.equal(200);
            expect(res.body).to.have.property('scenarios');
            expect(res.body.scenarios).to.be.an('array');
        });

        it('GET /api/scenarios/:scenarioId - treba vratiti scenario iz baze', async () => {
            const createRes = await request(API_URL)
                .post('/api/scenarios')
                .send({ title: 'Get Test Scenario' });

            const scenarioId = createRes.body.id;

            const res = await request(API_URL)
                .get(`/api/scenarios/${scenarioId}`);

            expect(res.status).to.equal(200);
            expect(res.body).to.have.property('id', scenarioId);
            expect(res.body).to.have.property('title', 'Get Test Scenario');
            expect(res.body).to.have.property('content');
        });

        it('POST /api/scenarios/:scenarioId/lines/:lineId/lock - treba raditi sa bazom', async () => {
            const createRes = await request(API_URL)
                .post('/api/scenarios')
                .send({ title: 'Lock Test Scenario' });

            const scenarioId = createRes.body.id;

            const res = await request(API_URL)
                .post(`/api/scenarios/${scenarioId}/lines/1/lock`)
                .send({ userId: userId1 });

            expect(res.status).to.equal(200);
            expect(res.body.message).to.contain('zakljucana');
        });

        it('PUT /api/scenarios/:scenarioId/lines/:lineId - treba ažurirati liniju u bazi i kreirati delta', async () => {
            const createRes = await request(API_URL)
                .post('/api/scenarios')
                .send({ title: 'Update Test Scenario' });

            const scenarioId = createRes.body.id;

            await request(API_URL)
                .post(`/api/scenarios/${scenarioId}/lines/1/lock`)
                .send({ userId: userId1 });

            const updateRes = await request(API_URL)
                .put(`/api/scenarios/${scenarioId}/lines/1`)
                .send({
                    userId: userId1,
                    newText: ['Ažurirani tekst']
                });

            expect(updateRes.status).to.equal(200);

            const getRes = await request(API_URL)
                .get(`/api/scenarios/${scenarioId}`);

            const line = getRes.body.content.find(l => l.lineId === 1);
            expect(line).to.exist;
            expect(line.text).to.contain('Ažurirani');

            const deltasRes = await request(API_URL)
                .get(`/api/scenarios/${scenarioId}/deltas`);

            const hasLineUpdate = deltasRes.body.deltas.some(d => 
                d.type === 'line_update' && d.lineId === 1
            );
            expect(hasLineUpdate).to.be.true;
        });

        it('POST /api/scenarios/:scenarioId/characters/lock - treba raditi sa bazom', async () => {
            const createRes = await request(API_URL)
                .post('/api/scenarios')
                .send({ title: 'Character Lock Test' });

            const scenarioId = createRes.body.id;

            const res = await request(API_URL)
                .post(`/api/scenarios/${scenarioId}/characters/lock`)
                .send({ userId: userId1, characterName: 'BOB' });

            expect(res.status).to.equal(200);
            expect(res.body.message).to.contain('zakljucano');
        });

        it('POST /api/scenarios/:scenarioId/characters/update - treba ažurirati linije u bazi i kreirati delta', async () => {
            const createRes = await request(API_URL)
                .post('/api/scenarios')
                .send({ title: 'Character Update Test' });

            const scenarioId = createRes.body.id;

            await request(API_URL)
                .post(`/api/scenarios/${scenarioId}/lines/1/lock`)
                .send({ userId: userId1 });

            await request(API_URL)
                .put(`/api/scenarios/${scenarioId}/lines/1`)
                .send({
                    userId: userId1,
                    newText: ['BOB je glavni lik']
                });

            await request(API_URL)
                .post(`/api/scenarios/${scenarioId}/characters/lock`)
                .send({ userId: userId1, characterName: 'BOB' });

            const updateRes = await request(API_URL)
                .post(`/api/scenarios/${scenarioId}/characters/update`)
                .send({
                    userId: userId1,
                    oldName: 'BOB',
                    newName: 'ROBERT'
                });

            expect(updateRes.status).to.equal(200);

            const getRes = await request(API_URL)
                .get(`/api/scenarios/${scenarioId}`);

            const text = JSON.stringify(getRes.body.content);
            expect(text).to.contain('ROBERT');
            expect(text).to.not.contain('BOB');

            const deltasRes = await request(API_URL)
                .get(`/api/scenarios/${scenarioId}/deltas`);

            const hasCharRename = deltasRes.body.deltas.some(d => 
                d.type === 'char_rename' && d.oldName === 'BOB' && d.newName === 'ROBERT'
            );
            expect(hasCharRename).to.be.true;
        });

        it('GET /api/scenarios/:scenarioId/deltas - treba vratiti deltas iz baze', async () => {
            const createRes = await request(API_URL)
                .post('/api/scenarios')
                .send({ title: 'Deltas Test Scenario' });

            const scenarioId = createRes.body.id;

            await request(API_URL)
                .post(`/api/scenarios/${scenarioId}/lines/1/lock`)
                .send({ userId: userId1 });

            await request(API_URL)
                .put(`/api/scenarios/${scenarioId}/lines/1`)
                .send({
                    userId: userId1,
                    newText: ['Test delta']
                });

            const res = await request(API_URL)
                .get(`/api/scenarios/${scenarioId}/deltas`);

            expect(res.status).to.equal(200);
            expect(res.body).to.have.property('deltas');
            expect(res.body.deltas).to.be.an('array');
            expect(res.body.deltas.length).to.be.greaterThan(0);
        });

        it('GET /api/scenarios/:scenarioId/deltas?since=timestamp - treba vratiti samo deltas nakon timestampa', async () => {
            const createRes = await request(API_URL)
                .post('/api/scenarios')
                .send({ title: 'Since Test Scenario' });

            const scenarioId = createRes.body.id;

            await request(API_URL)
                .post(`/api/scenarios/${scenarioId}/lines/1/lock`)
                .send({ userId: userId1 });

            await request(API_URL)
                .put(`/api/scenarios/${scenarioId}/lines/1`)
                .send({
                    userId: userId1,
                    newText: ['Prva promjena']
                });

            await new Promise(resolve => setTimeout(resolve, 1000));

            const sinceTimestamp = Math.floor(Date.now() / 1000);

            await request(API_URL)
                .post(`/api/scenarios/${scenarioId}/lines/1/lock`)
                .send({ userId: userId1 });

            await request(API_URL)
                .put(`/api/scenarios/${scenarioId}/lines/1`)
                .send({
                    userId: userId1,
                    newText: ['Druga promjena']
                });

            const res = await request(API_URL)
                .get(`/api/scenarios/${scenarioId}/deltas`)
                .query({ since: sinceTimestamp });

            expect(res.status).to.equal(200);
            res.body.deltas.forEach(delta => {
                expect(delta.timestamp).to.be.greaterThan(sinceTimestamp);
            });
        });
    });

    describe('Integracijski testovi', () => {
        it('treba kreirati kompletan workflow: scenario -> linije -> checkpoint -> restore', async () => {
            const createRes = await request(API_URL)
                .post('/api/scenarios')
                .send({ title: 'Workflow Test' });

            const workflowScenarioId = createRes.body.id;

            await request(API_URL)
                .post(`/api/scenarios/${workflowScenarioId}/lines/1/lock`)
                .send({ userId: userId1 });

            await request(API_URL)
                .put(`/api/scenarios/${workflowScenarioId}/lines/1`)
                .send({
                    userId: userId1,
                    newText: ['Početni tekst']
                });

            const checkpointRes = await request(API_URL)
                .post(`/api/scenarios/${workflowScenarioId}/checkpoint`)
                .send({ userId: userId1 });

            expect(checkpointRes.status).to.equal(200);

            await request(API_URL)
                .post(`/api/scenarios/${workflowScenarioId}/lines/1/lock`)
                .send({ userId: userId1 });

            await request(API_URL)
                .put(`/api/scenarios/${workflowScenarioId}/lines/1`)
                .send({
                    userId: userId1,
                    newText: ['Ažurirani tekst']
                });

            const checkpointsRes = await request(API_URL)
                .get(`/api/scenarios/${workflowScenarioId}/checkpoints`);

            const firstCheckpointId = checkpointsRes.body[0].id;

            const restoreRes = await request(API_URL)
                .get(`/api/scenarios/${workflowScenarioId}/restore/${firstCheckpointId}`);

            expect(restoreRes.status).to.equal(200);
            expect(restoreRes.body).to.have.property('id', workflowScenarioId);
            expect(restoreRes.body).to.have.property('content');

            const restoredLine = restoreRes.body.content.find(l => l.lineId === 1);
            expect(restoredLine).to.exist;
        });

        it('treba testirati da checkpoint restore vraća tačno stanje u trenutku checkpointa', async function() {
            this.timeout(10000);

            const createRes = await request(API_URL)
                .post('/api/scenarios')
                .send({ title: 'Precise Restore Test' });

            const preciseScenarioId = createRes.body.id;

            await request(API_URL)
                .post(`/api/scenarios/${preciseScenarioId}/lines/1/lock`)
                .send({ userId: userId1 });

            await request(API_URL)
                .put(`/api/scenarios/${preciseScenarioId}/lines/1`)
                .send({
                    userId: userId1,
                    newText: ['Tekst prije checkpointa']
                });

            await new Promise(resolve => setTimeout(resolve, 1100));

            const checkpointRes = await request(API_URL)
                .post(`/api/scenarios/${preciseScenarioId}/checkpoint`)
                .send({ userId: userId1 });

            expect(checkpointRes.status).to.equal(200);

            await new Promise(resolve => setTimeout(resolve, 1100));

            await request(API_URL)
                .post(`/api/scenarios/${preciseScenarioId}/lines/1/lock`)
                .send({ userId: userId1 });

            await request(API_URL)
                .put(`/api/scenarios/${preciseScenarioId}/lines/1`)
                .send({
                    userId: userId1,
                    newText: ['Tekst nakon checkpointa']
                });

            const checkpointsRes = await request(API_URL)
                .get(`/api/scenarios/${preciseScenarioId}/checkpoints`);

            expect(checkpointsRes.body.length).to.be.greaterThan(0);
            const checkpointId = checkpointsRes.body[0].id;

            const restoreRes = await request(API_URL)
                .get(`/api/scenarios/${preciseScenarioId}/restore/${checkpointId}`);

            expect(restoreRes.status).to.equal(200);
            const restoredLine = restoreRes.body.content.find(l => l.lineId === 1);
            
            expect(restoredLine).to.exist;
            expect(restoredLine.text).to.contain('prije checkpointa');
            expect(restoredLine.text).to.not.contain('nakon checkpointa');
        });
    });
});
