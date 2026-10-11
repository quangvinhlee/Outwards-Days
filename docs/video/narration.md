# Narration and chapters

Voice: en-AU-NatashaNeural, synthetic Australian English, generated with edge-tts. Full video includes burned-in captions; a separate SRT is available.

## Chapter markers

0:00 Make a little room for outside
0:19 Your interests, pace and limits
0:40 Plan around real life
1:06 How the AI creates your plan
1:36 Small moments, a varied week
2:00 See the whole outing
2:25 Optional missions and reflections
2:48 Discover nearby outdoors
3:10 Every outing counts

## Full narration

### Make a little room for outside

Outwards Days makes a little room for outside. It turns the week you actually have into small outdoor moments, from a walk or a few pages in the park, to gardening, photography, or a longer outing. This walkthrough uses the Android emulator and a locally running backend.

### Your interests, pace and limits

Start with what brings you outside. Choose your interests, your pace, how many days you want to go out, and the length of your activities. Add your travel estimate and equipment access. Approximate location and reminders are optional. These preferences help the planner suggest something you can actually do.

### Plan around real life

Next, review your week. Include sleep, work, commuting, and other commitments. You can reuse last week, add weekday work hours, or mark a full day off. Lunch becomes available only when you explicitly add a break. Review all seven days, then confirm your week. The planner leaves room for your morning routine and getting home after work.

### How the AI creates your plan

When you find ideas or refresh a plan, the backend first calculates eligible time slots. A Mastra workflow asks Gemma, running through Ollama, to choose and personalize activities using those slots and your preferences. The model does not receive your raw calendar commitments. Separate validation checks the response and the full time budget. Invalid output gets one repair attempt, then an explicitly labelled basic catalogue fallback.

### Small moments, a varied week

Here is a saved week labelled personalized with Gemma. It includes photography, reading, movement, a picnic, gardening, hiking, and walking. Each card shows when to go, where to go, and the total time you need. These are suggestions for you to review. A named place is not a guarantee of access or route conditions.

### See the whole outing

Open an outing to see the details. The time budget includes getting ready, travelling out, the activity, coming home, and a return buffer. You choose whether to accept it. Accepted plans can be moved, replaced, or skipped, and changes to your availability may mean a plan needs review. Longer outings also need enough daylight and suitable conditions.

### Optional missions and reflections

Mini missions give you something to notice, try, or reflect on. Some are simple actions, some invite a written note, and photo missions can use the camera with Gemma vision checking the selected subject. Camera checks unlock only after acceptance and the scheduled start. The full camera journey on a real phone still needs testing.

### Discover nearby outdoors

Explore nearby parks, rivers, and mapped loop hikes. The app uses source-linked place data and, when coordinates are available, weather and daylight information. Map coverage can be incomplete. Straight-line distance is not travel time, so check the real journey, entrance, and conditions before heading out.

### Every outing counts

The You tab keeps your outdoor story and past weeks. After an outing, record completed or partly completed, with honest feedback. Plans are cached on the phone, and completion can queue locally until you reconnect. Generation still needs the backend and model service. Real-phone offline and outdoor testing remain next steps. A little room for outside, without a streak to lose.
