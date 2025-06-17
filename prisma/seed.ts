// prisma/seed.ts

import { PrismaClient, Difficulty } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Start seeding...');

  // 1. Clear previous data in the correct order to avoid constraint errors
  await prisma.option.deleteMany({});
  await prisma.question.deleteMany({});
  await prisma.category.deleteMany({});
  console.log('Cleared existing questions, options, and categories.');

  // 2. Create Categories first
  console.log('Creating categories...');
  const generalCategory = await prisma.category.create({
    data: { name: 'General Knowledge' },
  });
  const scienceCategory = await prisma.category.create({
    data: { name: 'Science & Nature' },
  });
  const historyCategory = await prisma.category.create({
    data: { name: 'History' },
  });
  const entertainmentCategory = await prisma.category.create({
    data: { name: 'Entertainment' },
  });
  console.log('Categories created.');

  // 3. Define questions and link them to a categoryId and difficulty
  const allQuestions = [
    // --- EASY QUESTIONS ---
    { text: 'What is the capital of Japan?', difficulty: Difficulty.EASY, categoryId: generalCategory.id, options: [{ text: 'Beijing' }, { text: 'Seoul' }, { text: 'Tokyo', isCorrect: true }, { text: 'Bangkok' }] },
    { text: 'Which animal is known as the "King of the Jungle"?', difficulty: Difficulty.EASY, categoryId: scienceCategory.id, options: [{ text: 'Tiger' }, { text: 'Elephant' }, { text: 'Lion', isCorrect: true }, { text: 'Bear' }] },
    { text: 'How many days are in a week?', difficulty: Difficulty.EASY, categoryId: generalCategory.id, options: [{ text: '5' }, { text: '6' }, { text: '7', isCorrect: true }, { text: '8' }] },
    { text: 'What color is a banana?', difficulty: Difficulty.EASY, categoryId: scienceCategory.id, options: [{ text: 'Red' }, { text: 'Blue' }, { text: 'Yellow', isCorrect: true }, { text: 'Green' }] },
    { text: 'What do bees produce?', difficulty: Difficulty.EASY, categoryId: scienceCategory.id, options: [{ text: 'Milk' }, { text: 'Silk' }, { text: 'Honey', isCorrect: true }, { text: 'Pollen' }] },
    { text: 'Which is the largest planet in our solar system?', difficulty: Difficulty.EASY, categoryId: scienceCategory.id, options: [{ text: 'Earth' }, { text: 'Mars' }, { text: 'Jupiter', isCorrect: true }, { text: 'Saturn' }] },
    { text: 'What is the main language spoken in Brazil?', difficulty: Difficulty.EASY, categoryId: generalCategory.id, options: [{ text: 'Spanish' }, { text: 'English' }, { text: 'Portuguese', isCorrect: true }, { text: 'French' }] },
    { text: 'How many continents are there?', difficulty: Difficulty.EASY, categoryId: generalCategory.id, options: [{ text: '5' }, { text: '6' }, { text: '7', isCorrect: true }, { text: '8' }] },
    { text: 'What is the opposite of "hot"?', difficulty: Difficulty.EASY, categoryId: generalCategory.id, options: [{ text: 'Warm' }, { text: 'Icy' }, { text: 'Cold', isCorrect: true }, { text: 'Sunny' }] },
    { text: 'What is the name of the fairy in Peter Pan?', difficulty: Difficulty.EASY, categoryId: entertainmentCategory.id, options: [{ text: 'Cinderella' }, { text: 'Ariel' }, { text: 'Tinker Bell', isCorrect: true }, { text: 'Belle' }] },
    { text: 'Which ocean is the largest?', difficulty: Difficulty.EASY, categoryId: scienceCategory.id, options: [{ text: 'Atlantic' }, { text: 'Indian' }, { text: 'Pacific', isCorrect: true }, { text: 'Arctic' }] },
    { text: 'What is a baby dog called?', difficulty: Difficulty.EASY, categoryId: scienceCategory.id, options: [{ text: 'Kitten' }, { text: 'Calf' }, { text: 'Puppy', isCorrect: true }, { text: 'Fawn' }] },
    { text: 'In which city is the Eiffel Tower located?', difficulty: Difficulty.EASY, categoryId: generalCategory.id, options: [{ text: 'London' }, { text: 'Rome' }, { text: 'Paris', isCorrect: true }, { text: 'Berlin' }] },
    { text: 'What is the primary ingredient in bread?', difficulty: Difficulty.EASY, categoryId: generalCategory.id, options: [{ text: 'Sugar' }, { text: 'Salt' }, { text: 'Flour', isCorrect: true }, { text: 'Butter' }] },
    { text: 'How many sides does a triangle have?', difficulty: Difficulty.EASY, categoryId: scienceCategory.id, options: [{ text: '2' }, { text: '4' }, { text: '3', isCorrect: true }, { text: '5' }] },
    { text: 'What is the currency of the United States?', difficulty: Difficulty.EASY, categoryId: generalCategory.id, options: [{ text: 'Euro' }, { text: 'Yen' }, { text: 'Dollar', isCorrect: true }, { text: 'Pound' }] },
    { text: 'Which country is famous for its pyramids?', difficulty: Difficulty.EASY, categoryId: historyCategory.id, options: [{ text: 'Greece' }, { text: 'Italy' }, { text: 'Egypt', isCorrect: true }, { text: 'Mexico' }] },
    { text: 'What is the color of the sky on a clear day?', difficulty: Difficulty.EASY, categoryId: scienceCategory.id, options: [{ text: 'Green' }, { text: 'Red' }, { text: 'Blue', isCorrect: true }, { text: 'Black' }] },
    { text: 'What is the first letter of the alphabet?', difficulty: Difficulty.EASY, categoryId: generalCategory.id, options: [{ text: 'B' }, { text: 'C' }, { text: 'A', isCorrect: true }, { text: 'Z' }] },
    { text: 'Which of these is a fruit?', difficulty: Difficulty.EASY, categoryId: scienceCategory.id, options: [{ text: 'Carrot' }, { text: 'Broccoli' }, { text: 'Apple', isCorrect: true }, { text: 'Potato' }] },
    { text: 'What is the main source of light during the day?', difficulty: Difficulty.EASY, categoryId: scienceCategory.id, options: [{ text: 'Moon' }, { text: 'Stars' }, { text: 'Sun', isCorrect: true }, { text: 'Lamp' }] },
    { text: 'Which season comes after summer?', difficulty: Difficulty.EASY, categoryId: scienceCategory.id, options: [{ text: 'Winter' }, { text: 'Spring' }, { text: 'Autumn', isCorrect: true }, { text: 'None' }] },
    { text: 'What is the chemical symbol for water?', difficulty: Difficulty.EASY, categoryId: scienceCategory.id, options: [{ text: 'O2' }, { text: 'CO2' }, { text: 'H2O', isCorrect: true }, { text: 'NaCl' }] },
    { text: 'What type of fish is Nemo?', difficulty: Difficulty.EASY, categoryId: entertainmentCategory.id, options: [{ text: 'Goldfish' }, { text: 'Shark' }, { text: 'Clownfish', isCorrect: true }, { text: 'Tuna' }] },
    { text: 'Which animal says "meow"?', difficulty: Difficulty.EASY, categoryId: scienceCategory.id, options: [{ text: 'Dog' }, { text: 'Cow' }, { text: 'Cat', isCorrect: true }, { text: 'Duck' }] },
    { text: 'What do you use to write on a blackboard?', difficulty: Difficulty.EASY, categoryId: generalCategory.id, options: [{ text: 'Pen' }, { text: 'Marker' }, { text: 'Chalk', isCorrect: true }, { text: 'Crayon' }] },
    { text: 'How many wheels does a bicycle have?', difficulty: Difficulty.EASY, categoryId: generalCategory.id, options: [{ text: '1' }, { text: '3' }, { text: '2', isCorrect: true }, { text: '4' }] },
    { text: 'Which is not a primary color?', difficulty: Difficulty.EASY, categoryId: generalCategory.id, options: [{ text: 'Red' }, { text: 'Blue' }, { text: 'Green', isCorrect: true }, { text: 'Yellow' }] },
    { text: 'What is the 7th month of the year?', difficulty: Difficulty.EASY, categoryId: generalCategory.id, options: [{ text: 'June' }, { text: 'August' }, { text: 'July', isCorrect: true }, { text: 'September' }] },
    { text: 'What is the fastest land animal?', difficulty: Difficulty.EASY, categoryId: scienceCategory.id, options: [{ text: 'Lion' }, { text: 'Horse' }, { text: 'Cheetah', isCorrect: true }, { text: 'Gazelle' }] },
    { text: 'Which superhero is from Krypton?', difficulty: Difficulty.EASY, categoryId: entertainmentCategory.id, options: [{ text: 'Batman' }, { text: 'Spider-Man' }, { text: 'Superman', isCorrect: true }, { text: 'Iron Man' }] },
    
    // --- MEDIUM QUESTIONS ---
    { text: 'Who painted the Mona Lisa?', difficulty: Difficulty.MEDIUM, categoryId: entertainmentCategory.id, options: [{ text: 'Vincent van Gogh' }, { text: 'Pablo Picasso' }, { text: 'Leonardo da Vinci', isCorrect: true }, { text: 'Claude Monet' }] },
    { text: 'What is the chemical symbol for gold?', difficulty: Difficulty.MEDIUM, categoryId: scienceCategory.id, options: [{ text: 'Ag' }, { text: 'Go' }, { text: 'Au', isCorrect: true }, { text: 'Gd' }] },
    { text: 'Which planet is closest to the sun?', difficulty: Difficulty.MEDIUM, categoryId: scienceCategory.id, options: [{ text: 'Venus' }, { text: 'Mars' }, { text: 'Mercury', isCorrect: true }, { text: 'Earth' }] },
    { text: 'What is the main ingredient in guacamole?', difficulty: Difficulty.MEDIUM, categoryId: generalCategory.id, options: [{ text: 'Tomato' }, { text: 'Onion' }, { text: 'Avocado', isCorrect: true }, { text: 'Lime' }] },
    { text: 'In which country would you find the Great Wall?', difficulty: Difficulty.MEDIUM, categoryId: historyCategory.id, options: [{ text: 'India' }, { text: 'Japan' }, { text: 'China', isCorrect: true }, { text: 'South Korea' }] },
    { text: 'What is the hardest natural substance on Earth?', difficulty: Difficulty.MEDIUM, categoryId: scienceCategory.id, options: [{ text: 'Gold' }, { text: 'Iron' }, { text: 'Diamond', isCorrect: true }, { text: 'Quartz' }] },
    { text: 'Who wrote the play "Romeo and Juliet"?', difficulty: Difficulty.MEDIUM, categoryId: entertainmentCategory.id, options: [{ text: 'Charles Dickens' }, { text: 'Jane Austen' }, { text: 'William Shakespeare', isCorrect: true }, { text: 'George Orwell' }] },
    { text: 'What process do plants use to make their own food?', difficulty: Difficulty.MEDIUM, categoryId: scienceCategory.id, options: [{ text: 'Respiration' }, { text: 'Transpiration' }, { text: 'Photosynthesis', isCorrect: true }, { text: 'Germination' }] },
    { text: 'How many bones are in the adult human body?', difficulty: Difficulty.MEDIUM, categoryId: scienceCategory.id, options: [{ text: '201' }, { text: '212' }, { text: '206', isCorrect: true }, { text: '209' }] },
    { text: 'Which country is both in Europe and Asia?', difficulty: Difficulty.MEDIUM, categoryId: generalCategory.id, options: [{ text: 'Spain' }, { text: 'Egypt' }, { text: 'Turkey', isCorrect: true }, { text: 'Greece' }] },
    { text: 'What is the capital of Australia?', difficulty: Difficulty.MEDIUM, categoryId: generalCategory.id, options: [{ text: 'Sydney' }, { text: 'Melbourne' }, { text: 'Canberra', isCorrect: true }, { text: 'Perth' }] },
    { text: 'What is the currency of Switzerland?', difficulty: Difficulty.MEDIUM, categoryId: generalCategory.id, options: [{ text: 'Euro' }, { text: 'Dollar' }, { text: 'Franc', isCorrect: true }, { text: 'Krone' }] },
    { text: 'Who invented the telephone?', difficulty: Difficulty.MEDIUM, categoryId: historyCategory.id, options: [{ text: 'Thomas Edison' }, { text: 'Nikola Tesla' }, { text: 'Alexander Graham Bell', isCorrect: true }, { text: 'Guglielmo Marconi' }] },
    { text: 'What is the tallest mountain in the world?', difficulty: Difficulty.MEDIUM, categoryId: scienceCategory.id, options: [{ text: 'K2' }, { text: 'Kangchenjunga' }, { text: 'Mount Everest', isCorrect: true }, { text: 'Lhotse' }] },
    { text: 'Which U.S. state is known as the "Sunshine State"?', difficulty: Difficulty.MEDIUM, categoryId: generalCategory.id, options: [{ text: 'California' }, { text: 'Texas' }, { text: 'Florida', isCorrect: true }, { text: 'Arizona' }] },
    { text: 'What is the main component of Earth\'s atmosphere?', difficulty: Difficulty.MEDIUM, categoryId: scienceCategory.id, options: [{ text: 'Oxygen' }, { text: 'Carbon Dioxide' }, { text: 'Nitrogen', isCorrect: true }, { text: 'Argon' }] },
    { text: 'Which band released the album "The Dark Side of the Moon"?', difficulty: Difficulty.MEDIUM, categoryId: entertainmentCategory.id, options: [{ text: 'The Beatles' }, { text: 'Led Zeppelin' }, { text: 'Pink Floyd', isCorrect: true }, { text: 'The Rolling Stones' }] },
    { text: 'What is the largest mammal in the world?', difficulty: Difficulty.MEDIUM, categoryId: scienceCategory.id, options: [{ text: 'Elephant' }, { text: 'Giraffe' }, { text: 'Blue Whale', isCorrect: true }, { text: 'Sperm Whale' }] },
    { text: 'Who was the first person to walk on the Moon?', difficulty: Difficulty.MEDIUM, categoryId: historyCategory.id, options: [{ text: 'Buzz Aldrin' }, { text: 'Yuri Gagarin' }, { text: 'Neil Armstrong', isCorrect: true }, { text: 'Michael Collins' }] },
    { text: 'What is the longest river in the world?', difficulty: Difficulty.MEDIUM, categoryId: scienceCategory.id, options: [{ text: 'Amazon River' }, { text: 'Yangtze River' }, { text: 'Nile River', isCorrect: true }, { text: 'Mississippi River' }] },
    { text: 'What does "www" stand for in a website browser?', difficulty: Difficulty.MEDIUM, categoryId: entertainmentCategory.id, options: [{ text: 'World Wide Web', isCorrect: true }, { text: 'World Web Wide' }, { text: 'Web World Wide' }, { text: 'Wide World Web' }] },
    { text: 'In which year did World War II end?', difficulty: Difficulty.MEDIUM, categoryId: historyCategory.id, options: [{ text: '1943' }, { text: '1944' }, { text: '1945', isCorrect: true }, { text: '1946' }] },
    { text: 'What is the fear of spiders called?', difficulty: Difficulty.MEDIUM, categoryId: scienceCategory.id, options: [{ text: 'Agoraphobia' }, { text: 'Acrophobia' }, { text: 'Arachnophobia', isCorrect: true }, { text: 'Claustrophobia' }] },
    { text: 'What element does "O" represent on the periodic table?', difficulty: Difficulty.MEDIUM, categoryId: scienceCategory.id, options: [{ text: 'Osmium' }, { text: 'Gold' }, { text: 'Oxygen', isCorrect: true }, { text: 'Oganesson' }] },
    { text: 'Which artist cut off a part of his own ear?', difficulty: Difficulty.MEDIUM, categoryId: entertainmentCategory.id, options: [{ text: 'Pablo Picasso' }, { text: 'Salvador Dalí' }, { text: 'Vincent van Gogh', isCorrect: true }, { text: 'Claude Monet' }] },
    { text: 'Which country invented tea?', difficulty: Difficulty.MEDIUM, categoryId: historyCategory.id, options: [{ text: 'India' }, { text: 'Japan' }, { text: 'China', isCorrect: true }, { text: 'England' }] },
    { text: 'Who is the author of the Harry Potter series?', difficulty: Difficulty.MEDIUM, categoryId: entertainmentCategory.id, options: [{ text: 'Suzanne Collins' }, { text: 'J.R.R. Tolkien' }, { text: 'J.K. Rowling', isCorrect: true }, { text: 'George R.R. Martin' }] },
    { text: 'What is the freezing point of water in Celsius?', difficulty: Difficulty.MEDIUM, categoryId: scienceCategory.id, options: [{ text: '32°C' }, { text: '-10°C' }, { text: '0°C', isCorrect: true }, { text: '100°C' }] },
    { text: 'What is the main currency of the European Union?', difficulty: Difficulty.MEDIUM, categoryId: generalCategory.id, options: [{ text: 'Franc' }, { text: 'Lira' }, { text: 'Euro', isCorrect: true }, { text: 'Mark' }] },
    { text: 'Which instrument has 88 keys?', difficulty: Difficulty.MEDIUM, categoryId: entertainmentCategory.id, options: [{ text: 'Guitar' }, { text: 'Violin' }, { text: 'Piano', isCorrect: true }, { text: 'Trumpet' }] },
    { text: 'Who discovered penicillin?', difficulty: Difficulty.MEDIUM, categoryId: historyCategory.id, options: [{ text: 'Marie Curie' }, { text: 'Louis Pasteur' }, { text: 'Alexander Fleming', isCorrect: true }, { text: 'Isaac Newton' }] },

    // --- HARD QUESTIONS ---
    { text: 'What is the capital of Bhutan?', difficulty: Difficulty.HARD, categoryId: generalCategory.id, options: [{ text: 'Kathmandu' }, { text: 'Dhaka' }, { text: 'Thimphu', isCorrect: true }, { text: 'Naypyidaw' }] },
    { text: 'Which chemical element has the highest melting point?', difficulty: Difficulty.HARD, categoryId: scienceCategory.id, options: [{ text: 'Titanium' }, { text: 'Platinum' }, { text: 'Tungsten', isCorrect: true }, { text: 'Osmium' }] },
    { text: 'In what year was the first "C" programming language standard published?', difficulty: Difficulty.HARD, categoryId: entertainmentCategory.id, options: [{ text: '1972' }, { text: '1983' }, { text: '1989', isCorrect: true }, { text: '1999' }] },
    { text: 'What is the study of fungi called?', difficulty: Difficulty.HARD, categoryId: scienceCategory.id, options: [{ text: 'Virology' }, { text: 'Botany' }, { text: 'Mycology', isCorrect: true }, { text: 'Zoology' }] },
    { text: 'Who composed the "Brandenburg Concertos"?', difficulty: Difficulty.HARD, categoryId: entertainmentCategory.id, options: [{ text: 'Mozart' }, { text: 'Beethoven' }, { text: 'Johann Sebastian Bach', isCorrect: true }, { text: 'Vivaldi' }] },
    { text: 'What is the "Turing test" used to determine?', difficulty: Difficulty.HARD, categoryId: scienceCategory.id, options: [{ text: 'A machine\'s processing speed' }, { text: 'A machine\'s ability to exhibit intelligent behavior', isCorrect: true }, { text: 'A machine\'s memory capacity' }, { text: 'A machine\'s encryption strength' }] },
    { text: 'The "Bay of Pigs" invasion was a failed attempt to overthrow which country\'s leader?', difficulty: Difficulty.HARD, categoryId: historyCategory.id, options: [{ text: 'Nicaragua' }, { text: 'Panama' }, { text: 'Cuba (Fidel Castro)', isCorrect: true }, { text: 'Chile' }] },
    { text: 'What does the "c" in E=mc² stand for?', difficulty: Difficulty.HARD, categoryId: scienceCategory.id, options: [{ text: 'Constant' }, { text: 'Calorie' }, { text: 'The speed of light', isCorrect: true }, { text: 'Charge' }] },
    { text: 'Which philosopher is famous for the concept of the "Übermensch"?', difficulty: Difficulty.HARD, categoryId: historyCategory.id, options: [{ text: 'Socrates' }, { text: 'Immanuel Kant' }, { text: 'Friedrich Nietzsche', isCorrect: true }, { text: 'Jean-Paul Sartre' }] },
    { text: 'What is the name of the strait that separates Asia from North America?', difficulty: Difficulty.HARD, categoryId: scienceCategory.id, options: [{ text: 'Strait of Gibraltar' }, { text: 'Strait of Hormuz' }, { text: 'Bering Strait', isCorrect: true }, { text: 'Strait of Malacca' }] },
    { text: 'Which ancient wonder was located in the city of Alexandria, Egypt?', difficulty: Difficulty.HARD, categoryId: historyCategory.id, options: [{ text: 'Hanging Gardens of Babylon' }, { text: 'Colossus of Rhodes' }, { text: 'Lighthouse of Alexandria', isCorrect: true }, { text: 'Mausoleum at Halicarnassus' }] },
    { text: 'What is the most abundant element in the Earth\'s crust?', difficulty: Difficulty.HARD, categoryId: scienceCategory.id, options: [{ text: 'Iron' }, { text: 'Silicon' }, { text: 'Oxygen', isCorrect: true }, { text: 'Aluminum' }] },
    { text: 'In Shakespeare\'s "Othello", who is the antagonist that manipulates the title character?', difficulty: Difficulty.HARD, categoryId: entertainmentCategory.id, options: [{ text: 'Cassio' }, { text: 'Roderigo' }, { text: 'Iago', isCorrect: true }, { text: 'Brabantio' }] },
    { text: 'Which king signed the Magna Carta in 1215?', difficulty: Difficulty.HARD, categoryId: historyCategory.id, options: [{ text: 'King Henry VIII' }, { text: 'King Richard the Lionheart' }, { text: 'King John', isCorrect: true }, { text: 'King Edward I' }] },
    { text: 'What is the Kardashev scale used to measure?', difficulty: Difficulty.HARD, categoryId: scienceCategory.id, options: [{ text: 'Earthquake intensity' }, { text: 'Stellar brightness' }, { text: 'A civilization\'s technological advancement', isCorrect: true }, { text: 'Cosmic microwave background radiation' }] },
    { text: 'The philosophical concept of "tabula rasa" refers to the idea that humans are born with what?', difficulty: Difficulty.HARD, categoryId: historyCategory.id, options: [{ text: 'Innate knowledge' }, { text: 'Original sin' }, { text: 'A blank slate', isCorrect: true }, { text: 'A soul' }] },
    { text: 'Which novel begins with the line, "It is a truth universally acknowledged..."?', difficulty: Difficulty.HARD, categoryId: entertainmentCategory.id, options: [{ text: 'Wuthering Heights' }, { text: 'Jane Eyre' }, { text: 'Pride and Prejudice', isCorrect: true }, { text: 'Sense and Sensibility' }] },
    { text: 'What is the name of the supercontinent that existed millions of years ago?', difficulty: Difficulty.HARD, categoryId: historyCategory.id, options: [{ text: 'Gondwana' }, { text: 'Laurasia' }, { text: 'Pangaea', isCorrect: true }, { text: 'Rodinia' }] },
    { text: 'Which particle is its own antiparticle?', difficulty: Difficulty.HARD, categoryId: scienceCategory.id, options: [{ text: 'Neutron' }, { text: 'Electron' }, { text: 'Photon', isCorrect: true }, { text: 'Proton' }] },
    { text: 'What is the name of the largest moon of Saturn?', difficulty: Difficulty.HARD, categoryId: scienceCategory.id, options: [{ text: 'Europa' }, { text: 'Ganymede' }, { text: 'Titan', isCorrect: true }, { text: 'Io' }] },
    { text: 'Who is considered the father of modern computer science?', difficulty: Difficulty.HARD, categoryId: historyCategory.id, options: [{ text: 'Charles Babbage' }, { text: 'John von Neumann' }, { text: 'Alan Turing', isCorrect: true }, { text: 'Ada Lovelace' }] },
    { text: 'Which country has the most time zones?', difficulty: Difficulty.HARD, categoryId: generalCategory.id, options: [{ text: 'Russia' }, { text: 'USA' }, { text: 'France', isCorrect: true }, { text: 'China' }] },
    { text: 'What is the name of the Japanese art of flower arranging?', difficulty: Difficulty.HARD, categoryId: entertainmentCategory.id, options: [{ text: 'Origami' }, { text: 'Bonsai' }, { text: 'Ikebana', isCorrect: true }, { text: 'Sumi-e' }] },
    { text: 'The "Doomsday Clock" is maintained by which organization?', difficulty: Difficulty.HARD, categoryId: scienceCategory.id, options: [{ text: 'United Nations' }, { text: 'World Health Organization' }, { text: 'Bulletin of the Atomic Scientists', isCorrect: true }, { text: 'NASA' }] },
    { text: 'What is the only bird known to fly backwards?', difficulty: Difficulty.HARD, categoryId: scienceCategory.id, options: [{ text: 'Sparrow' }, { text: 'Eagle' }, { text: 'Hummingbird', isCorrect: true }, { text: 'Owl' }] },
    { text: 'What is the main difference between a lager and an ale?', difficulty: Difficulty.HARD, categoryId: entertainmentCategory.id, options: [{ text: 'The type of grain used' }, { text: 'The alcohol content' }, { text: 'The type of yeast and fermentation temperature', isCorrect: true }, { text: 'The color' }] },
    { text: 'Which of the following is not a programming language?', difficulty: Difficulty.HARD, categoryId: entertainmentCategory.id, options: [{ text: 'Python' }, { text: 'Cobra' }, { text: 'Anaconda', isCorrect: true }, { text: 'Ruby' }] },
    { text: 'What is the capital of Iceland?', difficulty: Difficulty.HARD, categoryId: generalCategory.id, options: [{ text: 'Oslo' }, { text: 'Helsinki' }, { text: 'Reykjavik', isCorrect: true }, { text: 'Copenhagen' }] },
    { text: 'What is the standard unit of electrical resistance?', difficulty: Difficulty.HARD, categoryId: scienceCategory.id, options: [{ text: 'Volt' }, { text: 'Ampere' }, { text: 'Ohm', isCorrect: true }, { text: 'Watt' }] },
    { text: 'Which famous scientist developed the theory of general relativity?', difficulty: Difficulty.HARD, categoryId: scienceCategory.id, options: [{ text: 'Isaac Newton' }, { text: 'Galileo Galilei' }, { text: 'Albert Einstein', isCorrect: true }, { text: 'Stephen Hawking' }] },
    { text: 'What is the approximate speed of sound in air?', difficulty: Difficulty.HARD, categoryId: scienceCategory.id, options: [{ text: '1,235 km/h' }, { text: '343 m/s' , isCorrect: true }, { text: '767 mph' }, { text: 'All of the above' }] },
  ];

  // 4. Create Questions and connect them to a category
  console.log('Creating questions...');
  for (const q of allQuestions) {
    // This `create` statement now includes both `difficulty` and `categoryId`
    await prisma.question.create({
      data: { 
        text: q.text, 
        difficulty: q.difficulty, 
        categoryId: q.categoryId,
        options: { 
          create: q.options.map(opt => ({ text: opt.text, isCorrect: !!opt.isCorrect }))
        }
      },
    });
  }

  console.log('Seeding finished.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
