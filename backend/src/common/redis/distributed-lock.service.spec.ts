import { DistributedLockService } from './distributed-lock.service';

describe('DistributedLockService', () => {
  it('serializa o mesmo job quando Redis esta desabilitado', async () => {
    const service = new DistributedLockService(null);
    let releaseTask!: () => void;
    const taskGate = new Promise<void>((resolve) => {
      releaseTask = resolve;
    });
    const first = service.runExclusive('job:test', 1000, async () => {
      await taskGate;
      return 'done';
    });

    const concurrent = await service.runExclusive('job:test', 1000, () =>
      Promise.resolve('duplicate'),
    );

    expect(concurrent).toEqual({ acquired: false });
    releaseTask();
    await expect(first).resolves.toEqual({ acquired: true, value: 'done' });
  });

  it('libera o lock local mesmo quando o job falha', async () => {
    const service = new DistributedLockService(null);

    await expect(
      service.runExclusive('job:test', 1000, () =>
        Promise.reject(new Error('failure')),
      ),
    ).rejects.toThrow('failure');

    await expect(
      service.runExclusive('job:test', 1000, () => Promise.resolve('retried')),
    ).resolves.toEqual({ acquired: true, value: 'retried' });
  });
});
