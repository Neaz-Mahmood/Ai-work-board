export type Clock = {
  now(): Date;
};

export const systemClock: Clock = {
  now(): Date {
    return new Date();
  },
};
