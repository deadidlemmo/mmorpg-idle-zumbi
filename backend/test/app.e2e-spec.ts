import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';

describe('AppController (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  it('/ (GET)', () => {
    return request(app.getHttpServer())
      .get('/')
      .expect(200)
      .expect('Hello World!');
  });

  it('/combat/start (POST) nao expoe o combate manual legado', () => {
    return request(app.getHttpServer())
      .post('/combat/start')
      .send({ characterId: 'character-1', mobId: 'mob-1' })
      .expect(404);
  });

  afterEach(async () => {
    await app.close();
  });
});
