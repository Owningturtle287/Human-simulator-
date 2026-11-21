import { PLACES } from './space.ts';
import type { PlaceId } from './space.ts';

export type ThoughtKind = 'wake' | 'recall' | 'search' | 'miss' | 'notice' | 'drink' | 'food' | 'eat' | 'rest' | 'rested' | 'read' | 'reading' | 'explore' | 'arrive';
export type Thought = { id: number; time: number; kind: ThoughtKind; text: string };

// The same decision and memory are passed to the renderer. Only the wording varies.
export function speak(kind: ThoughtKind, place?: PlaceId, next?: PlaceId, random: () => number = Math.random) {
  const location = place ? PLACES[place].label : 'here';
  const destination = next ? PLACES[next].label : 'somewhere else';
  const select = (lines: string[]) => lines[Math.floor(random() * lines.length)] ?? lines[0];
  switch (kind) {
    case 'wake':
      return select(['It’s quiet in here. I think I’ll get a glass of water.', 'A little thirsty. Has the water been on the counter all morning?', 'I could use a drink before I do anything else.']);
    case 'recall':
      return select(['I remember seeing water by ', 'Last I checked, my glass was on ', 'I’m pretty sure I left the water at ', 'Wasn’t my water at ']) + location + select(['. I’ll check.', '.', '. Let’s see if it’s still there.']);
    case 'search':
      return select(['I could use some water. I’ll try ', 'I’m thirsty. Maybe I should check ', 'I haven’t looked at ']) + location + '.';
    case 'miss':
      return select(['The glass isn’t here anymore.', 'I could have sworn it was here.', 'No water here.', 'That’s odd. The spot is empty.']) + ' ' + select(['I’ll look at ', 'Maybe it’s by ', 'I’ll check around ']) + destination + '.';
    case 'notice':
      return select(['There’s my glass, by ', 'Ah, I can see the water at ', 'Found it. The glass is at ']) + location + '.';
    case 'drink':
      return select(['That’s better. I didn’t realize how thirsty I was.', 'A few sips helped. I’ll remember where I left it.', 'Good. I can think about something else now.', 'That took the edge off.']);
    case 'food':
      return select(['I’m getting hungry. I think there’s fruit by the sink.', 'Something small would be nice. I’ll go to the kitchen.', 'My stomach’s starting to get my attention. Maybe an apple.']);
    case 'eat':
      return select(['The apple helped. I feel a little more settled.', 'That was enough for now.', 'I’m glad I stopped for a bite.']);
    case 'rest':
      return select(['My legs feel heavy. I’ll sit on the edge of the bed for a bit.', 'I think I need a minute off my feet.', 'I can feel myself getting tired. I’m going to sit down.']);
    case 'rested':
      return select(['I feel more awake now.', 'That was a good place to stop for a minute.', 'All right. I’m ready to get up.']);
    case 'read':
      return select(['I want to see what I left open in that notebook.', 'I could spend a moment with the notebook at the desk.', 'The notebook is still on the desk. I want another look.']);
    case 'reading':
      return select(['I’d forgotten how crowded that page is.', 'I’ll leave the notebook open at this page.', 'I can pick this up again later.']);
    case 'explore':
      return select(['I think I’ll wander over to ', 'I want to take a closer look at ', 'I’ll spend a moment near ']) + location + '.';
    case 'arrive':
      return place === 'window'
        ? select(['The light is softer over here.', 'I can see the way the light falls across the floor.', 'It’s nice to stand by the window for a moment.'])
        : select(['Nothing seems out of place over here.', 'I’ll stay here a moment before moving on.', 'I’ve had a look around.']);
  }
}
