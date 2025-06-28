// prisma/seed.ts

import { PrismaClient, Difficulty } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Start seeding...");

  // 1. Clear previous data in the correct order to avoid constraint errors
  // IMPORTANT: Delete related records first if they depend on others
  await prisma.option.deleteMany({});
  await prisma.question.deleteMany({});
  await prisma.category.deleteMany({});
  console.log("Cleared existing questions, options, and categories.");

  // 2. Create Categories first
  console.log("Creating categories...");
  const generalCategory = await prisma.category.create({
    data: { name: "General Knowledge" },
  });
  const scienceCategory = await prisma.category.create({
    data: { name: "Science & Nature" },
  });
  const historyCategory = await prisma.category.create({
    data: { name: "History" },
  });
  const entertainmentCategory = await prisma.category.create({
    data: { name: "Entertainment" },
  });
  console.log("Categories created.");

  // 3. Define questions with new fields and correct option structure
  // Added explanation and learningTip fields for practice mode
  const allQuestions = [
    // --- EASY QUESTIONS ---
    {
      text: "What is the capital of Japan?",
      difficulty: Difficulty.EASY,
      categoryId: generalCategory.id,
      options: [
        { text: "Beijing" },
        { text: "Seoul" },
        { text: "Tokyo", isCorrect: true },
        { text: "Bangkok" },
      ],
      explanation:
        "Tokyo is the bustling capital city of Japan, known for its mix of traditional temples and futuristic skyscrapers.",
      learningTip: "Remember major world capitals. Flashcards can help!",
    },
    {
      text: 'Which animal is known as the "King of the Jungle"?',
      difficulty: Difficulty.EASY,
      categoryId: scienceCategory.id,
      options: [
        { text: "Tiger" },
        { text: "Elephant" },
        { text: "Lion", isCorrect: true },
        { text: "Bear" },
      ],
      explanation:
        'The lion is widely recognized as the "King of the Jungle" due to its majestic appearance and predatory nature.',
      learningTip:
        "Animal facts are fun! Look up interesting facts about different species.",
    },
    {
      text: "How many days are in a week?",
      difficulty: Difficulty.EASY,
      categoryId: generalCategory.id,
      options: [
        { text: "5" },
        { text: "6" },
        { text: "7", isCorrect: true },
        { text: "8" },
      ],
      explanation:
        "There are exactly 7 days in a standard week: Monday, Tuesday, Wednesday, Thursday, Friday, Saturday, and Sunday.",
      learningTip: "Basic units of time are fundamental knowledge.",
    },
    {
      text: "What color is a banana?",
      difficulty: Difficulty.EASY,
      categoryId: scienceCategory.id,
      options: [
        { text: "Red" },
        { text: "Blue" },
        { text: "Yellow", isCorrect: true },
        { text: "Green" },
      ],
      explanation:
        "Ripe bananas are typically bright yellow. Green bananas are unripe, and brown spots indicate overripeness.",
      learningTip: "Observe common fruits and vegetables closely.",
    },
    {
      text: "What do bees produce?",
      difficulty: Difficulty.EASY,
      categoryId: scienceCategory.id,
      options: [
        { text: "Milk" },
        { text: "Silk" },
        { text: "Honey", isCorrect: true },
        { text: "Pollen" },
      ],
      explanation:
        "Bees are well-known for producing honey, which they store in honeycombs as a food source.",
      learningTip:
        "Learn about the products animals contribute to nature and humans.",
    },
    {
      text: "Which is the largest planet in our solar system?",
      difficulty: Difficulty.EASY,
      categoryId: scienceCategory.id,
      options: [
        { text: "Earth" },
        { text: "Mars" },
        { text: "Jupiter", isCorrect: true },
        { text: "Saturn" },
      ],
      explanation:
        "Jupiter is the largest planet in our solar system, with a mass more than two and a half times that of all the other planets in the Solar System combined.",
      learningTip:
        "Memorize the order and key facts about planets in our solar system.",
    },
    {
      text: "What is the main language spoken in Brazil?",
      difficulty: Difficulty.EASY,
      categoryId: generalCategory.id,
      options: [
        { text: "Spanish" },
        { text: "English" },
        { text: "Portuguese", isCorrect: true },
        { text: "French" },
      ],
      explanation:
        "Brazil is the only Portuguese-speaking country in South America, a legacy of its colonial past.",
      learningTip:
        "Learn about the main languages spoken in different countries.",
    },
    {
      text: "How many continents are there?",
      difficulty: Difficulty.EASY,
      categoryId: generalCategory.id,
      options: [
        { text: "5" },
        { text: "6" },
        { text: "7", isCorrect: true },
        { text: "8" },
      ],
      explanation:
        "There are generally 7 continents: Asia, Africa, North America, South America, Antarctica, Europe, and Australia.",
      learningTip: "Geography basics are important for general knowledge.",
    },
    {
      text: 'What is the opposite of "hot"?',
      difficulty: Difficulty.EASY,
      categoryId: generalCategory.id,
      options: [
        { text: "Warm" },
        { text: "Icy" },
        { text: "Cold", isCorrect: true },
        { text: "Sunny" },
      ],
      explanation:
        "The direct opposite of hot is cold, representing the lower end of the temperature spectrum.",
      learningTip: "Focus on basic antonyms for simple vocabulary building.",
    },
    {
      text: "What is the name of the fairy in Peter Pan?",
      difficulty: Difficulty.EASY,
      categoryId: entertainmentCategory.id,
      options: [
        { text: "Cinderella" },
        { text: "Ariel" },
        { text: "Tinker Bell", isCorrect: true },
        { text: "Belle" },
      ],
      explanation:
        "Tinker Bell is the famous fairy companion of Peter Pan, often characterized by her mischievous nature.",
      learningTip:
        "Classic children's literature and characters are common trivia.",
    },
    {
      text: "Which ocean is the largest?",
      difficulty: Difficulty.EASY,
      categoryId: scienceCategory.id,
      options: [
        { text: "Atlantic" },
        { text: "Indian" },
        { text: "Pacific", isCorrect: true },
        { text: "Arctic" },
      ],
      explanation:
        "The Pacific Ocean is the largest and deepest of Earth's oceanic divisions, covering about a third of the surface of the planet.",
      learningTip: "Familiarize yourself with basic world geography.",
    },
    {
      text: "What is a baby dog called?",
      difficulty: Difficulty.EASY,
      categoryId: scienceCategory.id,
      options: [
        { text: "Kitten" },
        { text: "Calf" },
        { text: "Puppy", isCorrect: true },
        { text: "Fawn" },
      ],
      explanation:
        "A baby dog is called a puppy. Different baby animals have unique names.",
      learningTip: "Animal terminology is a common general knowledge topic.",
    },
    {
      text: "In which city is the Eiffel Tower located?",
      difficulty: Difficulty.EASY,
      categoryId: generalCategory.id,
      options: [
        { text: "London" },
        { text: "Rome" },
        { text: "Paris", isCorrect: true },
        { text: "Berlin" },
      ],
      explanation:
        "The Eiffel Tower is an iconic landmark located in Paris, France, and is one of the most visited monuments in the world.",
      learningTip: "Associate famous landmarks with their respective cities.",
    },
    {
      text: "What is the primary ingredient in bread?",
      difficulty: Difficulty.EASY,
      categoryId: generalCategory.id,
      options: [
        { text: "Sugar" },
        { text: "Salt" },
        { text: "Flour", isCorrect: true },
        { text: "Butter" },
      ],
      explanation:
        "Flour, typically made from wheat, is the foundational ingredient for most types of bread.",
      learningTip: "Understand the basic components of common foods.",
    },
    {
      text: "How many sides does a triangle have?",
      difficulty: Difficulty.EASY,
      categoryId: scienceCategory.id,
      options: [
        { text: "2" },
        { text: "4" },
        { text: "3", isCorrect: true },
        { text: "5" },
      ],
      explanation:
        "A triangle is a polygon with three edges and three vertices.",
      learningTip: "Basic geometric shapes are fundamental.",
    },
    {
      text: "What is the currency of the United States?",
      difficulty: Difficulty.EASY,
      categoryId: generalCategory.id,
      options: [
        { text: "Euro" },
        { text: "Yen" },
        { text: "Dollar", isCorrect: true },
        { text: "Pound" },
      ],
      explanation:
        "The United States uses the Dollar as its official currency, abbreviated as USD.",
      learningTip: "Familiarize yourself with major world currencies.",
    },
    {
      text: "Which country is famous for its pyramids?",
      difficulty: Difficulty.EASY,
      categoryId: historyCategory.id,
      options: [
        { text: "Greece" },
        { text: "Italy" },
        { text: "Egypt", isCorrect: true },
        { text: "Mexico" },
      ],
      explanation:
        "Egypt is renowned for its ancient pyramids, built as tombs for pharaohs.",
      learningTip:
        "Historical landmarks and their associated countries are common knowledge.",
    },
    {
      text: "What is the color of the sky on a clear day?",
      difficulty: Difficulty.EASY,
      categoryId: scienceCategory.id,
      options: [
        { text: "Green" },
        { text: "Red" },
        { text: "Blue", isCorrect: true },
        { text: "Black" },
      ],
      explanation:
        "The sky appears blue due to Rayleigh scattering of sunlight by the Earth's atmosphere.",
      learningTip: "Understand simple natural phenomena.",
    },
    {
      text: "What is the first letter of the alphabet?",
      difficulty: Difficulty.EASY,
      categoryId: generalCategory.id,
      options: [
        { text: "B" },
        { text: "C" },
        { text: "A", isCorrect: true },
        { text: "Z" },
      ],
      explanation: "The first letter of the English alphabet is A.",
      learningTip: "Fundamental literacy is often tested.",
    },
    {
      text: "Which of these is a fruit?",
      difficulty: Difficulty.EASY,
      categoryId: scienceCategory.id,
      options: [
        { text: "Carrot" },
        { text: "Broccoli" },
        { text: "Apple", isCorrect: true },
        { text: "Potato" },
      ],
      explanation:
        "Botanically, an apple is a fruit as it develops from the flower's ovary and contains seeds.",
      learningTip: "Know the botanical definitions of common foods.",
    },
    {
      text: "What is the main source of light during the day?",
      difficulty: Difficulty.EASY,
      categoryId: scienceCategory.id,
      options: [
        { text: "Moon" },
        { text: "Stars" },
        { text: "Sun", isCorrect: true },
        { text: "Lamp" },
      ],
      explanation:
        "The Sun is the star at the center of the Solar System and the primary source of light and heat for Earth.",
      learningTip: "Understand basic astronomical sources of light.",
    },
    {
      text: "Which season comes after summer?",
      difficulty: Difficulty.EASY,
      categoryId: scienceCategory.id,
      options: [
        { text: "Winter" },
        { text: "Spring" },
        { text: "Autumn", isCorrect: true },
        { text: "None" },
      ],
      explanation:
        "Autumn (also known as Fall in North America) follows summer and precedes winter, characterized by falling leaves and cooler temperatures.",
      learningTip: "Review the four seasons and their order.",
    },
    {
      text: "What is the chemical symbol for water?",
      difficulty: Difficulty.EASY,
      categoryId: scienceCategory.id,
      options: [
        { text: "O2" },
        { text: "CO2" },
        { text: "H2O", isCorrect: true },
        { text: "NaCl" },
      ],
      explanation:
        "H2O represents two hydrogen atoms and one oxygen atom, forming a molecule of water.",
      learningTip: "Familiarize yourself with common chemical formulas.",
    },
    {
      text: "What type of fish is Nemo?",
      difficulty: Difficulty.EASY,
      categoryId: entertainmentCategory.id,
      options: [
        { text: "Goldfish" },
        { text: "Shark" },
        { text: "Clownfish", isCorrect: true },
        { text: "Tuna" },
      ],
      explanation:
        'Nemo, the protagonist of Disney/Pixar\'s "Finding Nemo," is a young clownfish.',
      learningTip: "Popular animated movie characters are common trivia.",
    },
    {
      text: 'Which animal says "meow"?',
      difficulty: Difficulty.EASY,
      categoryId: scienceCategory.id,
      options: [
        { text: "Dog" },
        { text: "Cow" },
        { text: "Cat", isCorrect: true },
        { text: "Duck" },
      ],
      explanation: 'Cats are known for their distinctive "meow" vocalization.',
      learningTip: "Basic animal sounds are fundamental.",
    },
    {
      text: "What do you use to write on a blackboard?",
      difficulty: Difficulty.EASY,
      categoryId: generalCategory.id,
      options: [
        { text: "Pen" },
        { text: "Marker" },
        { text: "Chalk", isCorrect: true },
        { text: "Crayon" },
      ],
      explanation:
        "Chalk is a soft, white, porous sedimentary carbonate rock, traditionally used for writing on blackboards.",
      learningTip: "Identify common tools and their uses.",
    },
    {
      text: "How many wheels does a bicycle have?",
      difficulty: Difficulty.EASY,
      categoryId: generalCategory.id,
      options: [
        { text: "1" },
        { text: "3" },
        { text: "2", isCorrect: true },
        { text: "4" },
      ],
      explanation:
        'The prefix "bi-" means two, indicating two wheels for a bicycle.',
      learningTip: "Understand prefixes for common words.",
    },
    {
      text: "Which is not a primary color?",
      difficulty: Difficulty.EASY,
      categoryId: generalCategory.id,
      options: [
        { text: "Red" },
        { text: "Blue" },
        { text: "Green", isCorrect: true },
        { text: "Yellow" },
      ],
      explanation:
        "Primary colors are Red, Yellow, and Blue. Green is a secondary color, made by mixing blue and yellow.",
      learningTip: "Memorize primary and secondary colors in art.",
    },
    {
      text: "What is the 7th month of the year?",
      difficulty: Difficulty.EASY,
      categoryId: generalCategory.id,
      options: [
        { text: "June" },
        { text: "August" },
        { text: "July", isCorrect: true },
        { text: "September" },
      ],
      explanation:
        "The months of the year follow a specific order, and July is the seventh month.",
      learningTip: "Practice the order of months in a year.",
    },
    {
      text: "What is the fastest land animal?",
      difficulty: Difficulty.EASY,
      categoryId: scienceCategory.id,
      options: [
        { text: "Lion" },
        { text: "Horse" },
        { text: "Cheetah", isCorrect: true },
        { text: "Gazelle" },
      ],
      explanation:
        "The cheetah is known as the fastest land animal, capable of running at speeds up to 120 km/h (75 mph) over short distances.",
      learningTip: "Learn about animal speeds and adaptations.",
    },
    {
      text: "Which superhero is from Krypton?",
      difficulty: Difficulty.EASY,
      categoryId: entertainmentCategory.id,
      options: [
        { text: "Batman" },
        { text: "Spider-Man" },
        { text: "Superman", isCorrect: true },
        { text: "Iron Man" },
      ],
      explanation:
        "Superman, also known as Kal-El, is an alien from the planet Krypton who was sent to Earth as a baby.",
      learningTip:
        "Familiarize yourself with origins of popular comic book characters.",
    },
    {
      text: "Which country is shaped like a boot?",
      difficulty: Difficulty.EASY,
      categoryId: generalCategory.id,
      options: [
        { text: "Greece" },
        { text: "Japan" },
        { text: "Italy", isCorrect: true },
        { text: "Spain" },
      ],
      explanation:
        "Italy is famously shaped like a high-heeled boot, extending into the Mediterranean Sea.",
      learningTip: "Visual cues can help remember country shapes.",
    },
    {
      text: "What is the largest organ in the human body?",
      difficulty: Difficulty.EASY,
      categoryId: scienceCategory.id,
      options: [
        { text: "Heart" },
        { text: "Brain" },
        { text: "Skin", isCorrect: true },
        { text: "Liver" },
      ],
      explanation:
        "The skin is the largest organ of the human body, serving as a protective barrier.",
      learningTip: "Learn about major human organs and their functions.",
    },
    {
      text: "How many planets are in our solar system?",
      difficulty: Difficulty.EASY,
      categoryId: scienceCategory.id,
      options: [
        { text: "7" },
        { text: "9" },
        { text: "8", isCorrect: true },
        { text: "10" },
      ],
      explanation:
        "After Pluto was reclassified as a dwarf planet, there are now officially 8 planets in our solar system.",
      learningTip: "Keep up-to-date with astronomy definitions.",
    },
    {
      text: "What is a common household pet that barks?",
      difficulty: Difficulty.EASY,
      categoryId: scienceCategory.id,
      options: [
        { text: "Cat" },
        { text: "Bird" },
        { text: "Dog", isCorrect: true },
        { text: "Fish" },
      ],
      explanation:
        "Dogs are well-known for their characteristic barking sound.",
      learningTip: "Observe common animal behaviors.",
    },
    {
      text: "Which fruit is red and has seeds on the outside?",
      difficulty: Difficulty.EASY,
      categoryId: scienceCategory.id,
      options: [
        { text: "Apple" },
        { text: "Cherry" },
        { text: "Strawberry", isCorrect: true },
        { text: "Raspberry" },
      ],
      explanation:
        "Strawberries have small, edible seeds on their outer surface, unlike many other fruits.",
      learningTip: "Pay attention to unique characteristics of fruits.",
    },
    {
      text: 'What is the opposite of "day"?',
      difficulty: Difficulty.EASY,
      categoryId: generalCategory.id,
      options: [
        { text: "Morning" },
        { text: "Afternoon" },
        { text: "Night", isCorrect: true },
        { text: "Evening" },
      ],
      explanation:
        "Night is the period of darkness in each twenty-four hours when the sun is below the horizon.",
      learningTip: "Basic opposites are foundational vocabulary.",
    },

    // --- MEDIUM QUESTIONS ---
    {
      text: "Who painted the Mona Lisa?",
      difficulty: Difficulty.MEDIUM,
      categoryId: entertainmentCategory.id,
      options: [
        { text: "Vincent van Gogh" },
        { text: "Pablo Picasso" },
        { text: "Leonardo da Vinci", isCorrect: true },
        { text: "Claude Monet" },
      ],
      explanation:
        "The Mona Lisa, a half-length portrait painting by Italian artist Leonardo da Vinci, is considered an archetypal masterpiece of the Italian Renaissance.",
      learningTip:
        "Famous artworks and their creators are common cultural knowledge.",
    },
    {
      text: "What is the chemical symbol for gold?",
      difficulty: Difficulty.MEDIUM,
      categoryId: scienceCategory.id,
      options: [
        { text: "Ag" },
        { text: "Go" },
        { text: "Au", isCorrect: true },
        { text: "Gd" },
      ],
      explanation:
        "The chemical symbol for gold is Au, derived from its Latin name, aurum.",
      learningTip:
        "Learn common elements and their symbols on the periodic table.",
    },
    {
      text: "Which planet is closest to the sun?",
      difficulty: Difficulty.MEDIUM,
      categoryId: scienceCategory.id,
      options: [
        { text: "Venus" },
        { text: "Mars" },
        { text: "Mercury", isCorrect: true },
        { text: "Earth" },
      ],
      explanation:
        "Mercury is the smallest planet in our solar system and the closest to the Sun.",
      learningTip: "Review facts about inner solar system planets.",
    },
    {
      text: "What is the main ingredient in guacamole?",
      difficulty: Difficulty.MEDIUM,
      categoryId: generalCategory.id,
      options: [
        { text: "Tomato" },
        { text: "Onion" },
        { text: "Avocado", isCorrect: true },
        { text: "Lime" },
      ],
      explanation:
        "Guacamole is an avocado-based dip, spread, or salad first developed by the Aztecs in what is now Mexico.",
      learningTip:
        "Learn about popular international dishes and their main ingredients.",
    },
    {
      text: "In which country would you find the Great Wall?",
      difficulty: Difficulty.MEDIUM,
      categoryId: historyCategory.id,
      options: [
        { text: "India" },
        { text: "Japan" },
        { text: "China", isCorrect: true },
        { text: "South Korea" },
      ],
      explanation:
        "The Great Wall of China is a series of fortifications built across the historical northern borders of ancient Chinese states.",
      learningTip:
        "Associate major historical structures with their countries of origin.",
    },
    {
      text: "What is the hardest natural substance on Earth?",
      difficulty: Difficulty.MEDIUM,
      categoryId: scienceCategory.id,
      options: [
        { text: "Gold" },
        { text: "Iron" },
        { text: "Diamond", isCorrect: true },
        { text: "Quartz" },
      ],
      explanation:
        "Diamond is the hardest known natural mineral and the hardest known natural material.",
      learningTip: "Learn about properties of common minerals and materials.",
    },
    {
      text: 'Who wrote the play "Romeo and Juliet"?',
      difficulty: Difficulty.MEDIUM,
      categoryId: entertainmentCategory.id,
      options: [
        { text: "Charles Dickens" },
        { text: "Jane Austen" },
        { text: "William Shakespeare", isCorrect: true },
        { text: "George Orwell" },
      ],
      explanation:
        'William Shakespeare, the renowned English playwright, is the author of the tragic play "Romeo and Juliet".',
      learningTip:
        "Familiarize yourself with famous authors and their most notable works.",
    },
    {
      text: "What process do plants use to make their own food?",
      difficulty: Difficulty.MEDIUM,
      categoryId: scienceCategory.id,
      options: [
        { text: "Respiration" },
        { text: "Transpiration" },
        { text: "Photosynthesis", isCorrect: true },
        { text: "Germination" },
      ],
      explanation:
        "Photosynthesis is the process by which green plants and some other organisms use sunlight to synthesize foods from carbon dioxide and water.",
      learningTip: "Understand basic biological processes in nature.",
    },
    {
      text: "How many bones are in the adult human body?",
      difficulty: Difficulty.MEDIUM,
      categoryId: scienceCategory.id,
      options: [
        { text: "201" },
        { text: "212" },
        { text: "206", isCorrect: true },
        { text: "209" },
      ],
      explanation: "The adult human skeleton typically consists of 206 bones.",
      learningTip: "Basic human anatomy is a common quiz topic.",
    },
    {
      text: "Which country is both in Europe and Asia?",
      difficulty: Difficulty.MEDIUM,
      categoryId: generalCategory.id,
      options: [
        { text: "Spain" },
        { text: "Egypt" },
        { text: "Turkey", isCorrect: true },
        { text: "Greece" },
      ],
      explanation:
        "Turkey is a transcontinental country, with its territory located mostly on the Anatolian Peninsula in Western Asia, and a smaller portion on the Balkan Peninsula in Southeast Europe.",
      learningTip: "Learn about transcontinental countries.",
    },
    {
      text: "What is the capital of Australia?",
      difficulty: Difficulty.MEDIUM,
      categoryId: generalCategory.id,
      options: [
        { text: "Sydney" },
        { text: "Melbourne" },
        { text: "Canberra", isCorrect: true },
        { text: "Perth" },
      ],
      explanation:
        "While Sydney and Melbourne are larger cities, Canberra is the capital of Australia, designed specifically for that purpose.",
      learningTip:
        "Distinguish between largest city and capital city for countries.",
    },
    {
      text: "What is the currency of Switzerland?",
      difficulty: Difficulty.MEDIUM,
      categoryId: generalCategory.id,
      options: [
        { text: "Euro" },
        { text: "Dollar" },
        { text: "Franc", isCorrect: true },
        { text: "Krone" },
      ],
      explanation:
        "The official currency of Switzerland and Liechtenstein is the Swiss Franc (CHF).",
      learningTip: "Know currencies of economically significant countries.",
    },
    {
      text: "Who invented the telephone?",
      difficulty: Difficulty.MEDIUM,
      categoryId: historyCategory.id,
      options: [
        { text: "Thomas Edison" },
        { text: "Nikola Tesla" },
        { text: "Alexander Graham Bell", isCorrect: true },
        { text: "Guglielmo Marconi" },
      ],
      explanation:
        "Alexander Graham Bell is widely credited as the inventor of the telephone.",
      learningTip:
        "Familiarize yourself with key inventors and their inventions.",
    },
    {
      text: "What is the tallest mountain in the world?",
      difficulty: Difficulty.MEDIUM,
      categoryId: scienceCategory.id,
      options: [
        { text: "K2" },
        { text: "Kangchenjunga" },
        { text: "Mount Everest", isCorrect: true },
        { text: "Lhotse" },
      ],
      explanation:
        "Mount Everest, located in the Himalayas, is the Earth's highest mountain above sea level.",
      learningTip: "Geographical superlatives are common trivia.",
    },
    {
      text: 'Which U.S. state is known as the "Sunshine State"?',
      difficulty: Difficulty.MEDIUM,
      categoryId: generalCategory.id,
      options: [
        { text: "California" },
        { text: "Texas" },
        { text: "Florida", isCorrect: true },
        { text: "Arizona" },
      ],
      explanation:
        'Florida is officially known as the "Sunshine State" due to its typically warm and sunny climate.',
      learningTip: "Learn state nicknames and their origins.",
    },
    {
      text: "What is the main component of Earth's atmosphere?",
      difficulty: Difficulty.MEDIUM,
      categoryId: scienceCategory.id,
      options: [
        { text: "Oxygen" },
        { text: "Carbon Dioxide" },
        { text: "Nitrogen", isCorrect: true },
        { text: "Argon" },
      ],
      explanation:
        "Nitrogen makes up about 78% of Earth's atmosphere, followed by oxygen at about 21%.",
      learningTip: "Understand the composition of Earth's atmosphere.",
    },
    {
      text: 'Which band released the album "The Dark Side of the Moon"?',
      difficulty: Difficulty.MEDIUM,
      categoryId: entertainmentCategory.id,
      options: [
        { text: "The Beatles" },
        { text: "Led Zeppelin" },
        { text: "Pink Floyd", isCorrect: true },
        { text: "The Rolling Stones" },
      ],
      explanation:
        'Pink Floyd\'s "The Dark Side of the Moon" is one of the best-selling and most critically acclaimed albums of all time.',
      learningTip: "Know iconic albums and the bands that created them.",
    },
    {
      text: "What is the largest mammal in the world?",
      difficulty: Difficulty.MEDIUM,
      categoryId: scienceCategory.id,
      options: [
        { text: "Elephant" },
        { text: "Giraffe" },
        { text: "Blue Whale", isCorrect: true },
        { text: "Sperm Whale" },
      ],
      explanation:
        "The blue whale is the largest animal known to have ever lived, weighing up to 200 tons and reaching lengths of 30 meters.",
      learningTip:
        "Distinguish between largest land animal and largest animal overall.",
    },
    {
      text: "Who was the first person to walk on the Moon?",
      difficulty: Difficulty.MEDIUM,
      categoryId: historyCategory.id,
      options: [
        { text: "Buzz Aldrin" },
        { text: "Yuri Gagarin" },
        { text: "Neil Armstrong", isCorrect: true },
        { text: "Michael Collins" },
      ],
      explanation:
        "Neil Armstrong was the first person to walk on the Moon, on July 20, 1969, as part of the Apollo 11 mission.",
      learningTip:
        "Space exploration milestones are important historical events.",
    },
    {
      text: "What is the longest river in the world?",
      difficulty: Difficulty.MEDIUM,
      categoryId: scienceCategory.id,
      options: [
        { text: "Amazon River" },
        { text: "Yangtze River" },
        { text: "Nile River", isCorrect: true },
        { text: "Mississippi River" },
      ],
      explanation:
        "The Nile River is considered the longest river in the world, flowing through northeastern Africa.",
      learningTip: "Geographical superlatives are common quiz topics.",
    },
    {
      text: 'What does "www" stand for in a website browser?',
      difficulty: Difficulty.MEDIUM,
      categoryId: entertainmentCategory.id,
      options: [
        { text: "World Wide Web", isCorrect: true },
        { text: "World Web Wide" },
        { text: "Web World Wide" },
        { text: "Wide World Web" },
      ],
      explanation:
        "WWW stands for World Wide Web, which is a global system of interconnected computer networks that uses the internet's standard communication protocols.",
      learningTip: "Understand common internet acronyms.",
    },
    {
      text: "In which year did World War II end?",
      difficulty: Difficulty.MEDIUM,
      categoryId: historyCategory.id,
      options: [
        { text: "1943" },
        { text: "1944" },
        { text: "1945", isCorrect: true },
        { text: "1946" },
      ],
      explanation:
        "World War II officially ended on September 2, 1945, with the formal surrender of Japan.",
      learningTip: "Memorize key dates in modern history.",
    },
    {
      text: "What is the fear of spiders called?",
      difficulty: Difficulty.MEDIUM,
      categoryId: scienceCategory.id,
      options: [
        { text: "Agoraphobia" },
        { text: "Acrophobia" },
        { text: "Arachnophobia", isCorrect: true },
        { text: "Claustrophobia" },
      ],
      explanation:
        "Arachnophobia is the specific phobia, or irrational fear, of spiders and other arachnids.",
      learningTip: "Learn common phobias and their Greek roots.",
    },
    {
      text: 'What element does "O" represent on the periodic table?',
      difficulty: Difficulty.MEDIUM,
      categoryId: scienceCategory.id,
      options: [
        { text: "Osmium" },
        { text: "Gold" },
        { text: "Oxygen", isCorrect: true },
        { text: "Oganesson" },
      ],
      explanation:
        "O is the chemical symbol for Oxygen, a vital element for life on Earth.",
      learningTip:
        "Familiarize yourself with common elements and their symbols.",
    },
    {
      text: "Which artist cut off a part of his own ear?",
      difficulty: Difficulty.MEDIUM,
      categoryId: entertainmentCategory.id,
      options: [
        { text: "Pablo Picasso" },
        { text: "Salvador Dalí" },
        { text: "Vincent van Gogh", isCorrect: true },
        { text: "Claude Monet" },
      ],
      explanation:
        "Vincent van Gogh, the Dutch post-impressionist painter, notoriously cut off part of his own ear in 1888.",
      learningTip: "Know unusual facts about famous artists.",
    },
    {
      text: "Which country invented tea?",
      difficulty: Difficulty.MEDIUM,
      categoryId: historyCategory.id,
      options: [
        { text: "India" },
        { text: "Japan" },
        { text: "China", isCorrect: true },
        { text: "England" },
      ],
      explanation:
        "Tea originated in China, where it has been consumed for thousands of years.",
      learningTip: "Understand the origins of popular foods and drinks.",
    },
    {
      text: "Who is the author of the Harry Potter series?",
      difficulty: Difficulty.MEDIUM,
      categoryId: entertainmentCategory.id,
      options: [
        { text: "Suzanne Collins" },
        { text: "J.R.R. Tolkien" },
        { text: "J.K. Rowling", isCorrect: true },
        { text: "George R.R. Martin" },
      ],
      explanation:
        "J.K. Rowling is the British author who created the widely popular Harry Potter fantasy series.",
      learningTip: "Know famous authors and their most popular series.",
    },
    {
      text: "What is the freezing point of water in Celsius?",
      difficulty: Difficulty.MEDIUM,
      categoryId: scienceCategory.id,
      options: [
        { text: "32°C" },
        { text: "-10°C" },
        { text: "0°C", isCorrect: true },
        { text: "100°C" },
      ],
      explanation:
        "Water freezes at 0 degrees Celsius and boils at 100 degrees Celsius at standard atmospheric pressure.",
      learningTip: "Memorize key temperatures for phase changes of water.",
    },
    {
      text: "What is the main currency of the European Union?",
      difficulty: Difficulty.MEDIUM,
      categoryId: generalCategory.id,
      options: [
        { text: "Franc" },
        { text: "Lira" },
        { text: "Euro", isCorrect: true },
        { text: "Mark" },
      ],
      explanation:
        "The Euro is the official currency of 20 of the 27 member states of the European Union.",
      learningTip: "Identify major global currencies.",
    },
    {
      text: "Which instrument has 88 keys?",
      difficulty: Difficulty.MEDIUM,
      categoryId: entertainmentCategory.id,
      options: [
        { text: "Guitar" },
        { text: "Violin" },
        { text: "Piano", isCorrect: true },
        { text: "Trumpet" },
      ],
      explanation: "A full-sized piano has 88 keys (52 white and 36 black).",
      learningTip: "Learn interesting facts about musical instruments.",
    },
    {
      text: "Who discovered penicillin?",
      difficulty: Difficulty.MEDIUM,
      categoryId: historyCategory.id,
      options: [
        { text: "Marie Curie" },
        { text: "Louis Pasteur" },
        { text: "Alexander Fleming", isCorrect: true },
        { text: "Isaac Newton" },
      ],
      explanation:
        "Alexander Fleming, a Scottish physician and microbiologist, discovered penicillin in 1928.",
      learningTip: "Know key figures in scientific discovery.",
    },
    {
      text: "Which gas do plants absorb from the atmosphere?",
      difficulty: Difficulty.MEDIUM,
      categoryId: scienceCategory.id,
      options: [
        { text: "Oxygen" },
        { text: "Nitrogen" },
        { text: "Carbon Dioxide", isCorrect: true },
        { text: "Hydrogen" },
      ],
      explanation:
        "Plants absorb carbon dioxide from the atmosphere during photosynthesis to produce food.",
      learningTip: "Understand the gas exchange in plant biology.",
    },
    {
      text: "What is the name of the biggest technology company in South Korea?",
      difficulty: Difficulty.MEDIUM,
      categoryId: entertainmentCategory.id,
      options: [
        { text: "LG" },
        { text: "Hyundai" },
        { text: "Samsung", isCorrect: true },
        { text: "Kia" },
      ],
      explanation:
        "Samsung is a global leader in technology, particularly known for electronics and semiconductors.",
      learningTip: "Identify major global corporations and their origins.",
    },
    {
      text: "What is the largest country in South America by land area?",
      difficulty: Difficulty.MEDIUM,
      categoryId: generalCategory.id,
      options: [
        { text: "Argentina" },
        { text: "Peru" },
        { text: "Brazil", isCorrect: true },
        { text: "Colombia" },
      ],
      explanation:
        "Brazil is the largest country in South America, both in terms of area and population.",
      learningTip: "Learn about the largest countries by continent.",
    },

    // --- HARD QUESTIONS ---
    {
      text: "What is the capital of Bhutan?",
      difficulty: Difficulty.HARD,
      categoryId: generalCategory.id,
      options: [
        { text: "Kathmandu" },
        { text: "Dhaka" },
        { text: "Thimphu", isCorrect: true },
        { text: "Naypyidaw" },
      ],
      explanation:
        "Thimphu is the capital and largest city of Bhutan, a country in the Eastern Himalayas.",
      learningTip:
        "Challenging capitals often involve smaller or less commonly discussed countries.",
    },
    {
      text: "Which chemical element has the highest melting point?",
      difficulty: Difficulty.HARD,
      categoryId: scienceCategory.id,
      options: [
        { text: "Titanium" },
        { text: "Platinum" },
        { text: "Tungsten", isCorrect: true },
        { text: "Osmium" },
      ],
      explanation:
        "Tungsten has the highest melting point of all known metals, at 3,422 °C (6,192 °F).",
      learningTip: "Look into extreme properties of elements.",
    },
    {
      text: 'In what year was the first "C" programming language standard published?',
      difficulty: Difficulty.HARD,
      categoryId: entertainmentCategory.id,
      options: [
        { text: "1972" },
        { text: "1983" },
        { text: "1989", isCorrect: true },
        { text: "1999" },
      ],
      explanation:
        "The first official standard for C, known as C89 or C90, was published by ANSI in 1989.",
      learningTip: "Key dates in computer science history can be obscure.",
    },
    {
      text: "What is the study of fungi called?",
      difficulty: Difficulty.HARD,
      categoryId: scienceCategory.id,
      options: [
        { text: "Virology" },
        { text: "Botany" },
        { text: "Mycology", isCorrect: true },
        { text: "Zoology" },
      ],
      explanation:
        "Mycology is the branch of biology concerned with the study of fungi, including their genetic and biochemical properties, their taxonomy, and their use to humans as a source for tinder, medicine, food, and entheogens, as well as their dangers, such as poisoning or infection.",
      learningTip: "Memorize scientific terms for branches of biology.",
    },
    {
      text: 'Who composed the "Brandenburg Concertos"?',
      difficulty: Difficulty.HARD,
      categoryId: entertainmentCategory.id,
      options: [
        { text: "Mozart" },
        { text: "Beethoven" },
        { text: "Johann Sebastian Bach", isCorrect: true },
        { text: "Vivaldi" },
      ],
      explanation:
        "The Brandenburg Concertos are a collection of six instrumental works by Johann Sebastian Bach, dedicated to Christian Ludwig, Margrave of Brandenburg-Schwedt.",
      learningTip:
        "Classical music composers and their major works are often asked.",
    },
    {
      text: 'What is the "Turing test" used to determine?',
      difficulty: Difficulty.HARD,
      categoryId: scienceCategory.id,
      options: [
        { text: "A machine's processing speed" },
        {
          text: "A machine's ability to exhibit intelligent behavior",
          isCorrect: true,
        },
        { text: "A machine's memory capacity" },
        { text: "A machine's encryption strength" },
      ],
      explanation:
        "The Turing test, developed by Alan Turing, is a test of a machine's ability to exhibit intelligent behavior equivalent to, or indistinguishable from, that of a human.",
      learningTip:
        "Understand fundamental concepts in AI and computer science.",
    },
    {
      text: 'The "Bay of Pigs" invasion was a failed attempt to overthrow which country\'s leader?',
      difficulty: Difficulty.HARD,
      categoryId: historyCategory.id,
      options: [
        { text: "Nicaragua" },
        { text: "Panama" },
        { text: "Cuba (Fidel Castro)", isCorrect: true },
        { text: "Chile" },
      ],
      explanation:
        "The Bay of Pigs Invasion was a failed landing operation on the southwestern coast of Cuba in 1961 by Cuban exiles who opposed Fidel Castro's Cuban Revolution.",
      learningTip: "Learn about key Cold War events and figures.",
    },
    {
      text: 'What does the "c" in E=mc² stand for?',
      difficulty: Difficulty.HARD,
      categoryId: scienceCategory.id,
      options: [
        { text: "Constant" },
        { text: "Calorie" },
        { text: "The speed of light", isCorrect: true },
        { text: "Charge" },
      ],
      explanation:
        'In Einstein\'s famous equation E=mc², "c" represents the speed of light in a vacuum, a universal physical constant.',
      learningTip: "Know the components of famous scientific equations.",
    },
    {
      text: 'Which philosopher is famous for the concept of the "Übermensch"?',
      difficulty: Difficulty.HARD,
      categoryId: historyCategory.id,
      options: [
        { text: "Socrates" },
        { text: "Immanuel Kant" },
        { text: "Friedrich Nietzsche", isCorrect: true },
        { text: "Jean-Paul Sartre" },
      ],
      explanation:
        'Friedrich Nietzsche introduced the concept of the "Übermensch" (Overman or Superman) in his philosophical novel "Thus Spoke Zarathustra".',
      learningTip:
        "Familiarize yourself with major philosophical concepts and their proponents.",
    },
    {
      text: "What is the name of the strait that separates Asia from North America?",
      difficulty: Difficulty.HARD,
      categoryId: scienceCategory.id,
      options: [
        { text: "Strait of Gibraltar" },
        { text: "Strait of Hormuz" },
        { text: "Bering Strait", isCorrect: true },
        { text: "Strait of Malacca" },
      ],
      explanation:
        "The Bering Strait is a strait of the Pacific Ocean, which separates Russia and the United States slightly south of the Arctic Circle.",
      learningTip:
        "Learn about important geographical straits and their locations.",
    },
    {
      text: "Which ancient wonder was located in the city of Alexandria, Egypt?",
      difficulty: Difficulty.HARD,
      categoryId: historyCategory.id,
      options: [
        { text: "Hanging Gardens of Babylon" },
        { text: "Colossus of Rhodes" },
        { text: "Lighthouse of Alexandria", isCorrect: true },
        { text: "Mausoleum at Halicarnassus" },
      ],
      explanation:
        "The Lighthouse of Alexandria, one of the Seven Wonders of the Ancient World, was a colossal lighthouse built by the Ptolemaic Kingdom of Ancient Egypt, located on the island of Pharos at Alexandria.",
      learningTip:
        "Know the Seven Wonders of the Ancient World and their locations.",
    },
    {
      text: "What is the most abundant element in the Earth's crust?",
      difficulty: Difficulty.HARD,
      categoryId: scienceCategory.id,
      options: [
        { text: "Iron" },
        { text: "Silicon" },
        { text: "Oxygen", isCorrect: true },
        { text: "Aluminum" },
      ],
      explanation:
        "Oxygen is the most abundant element in the Earth's crust, making up about 46% of its mass.",
      learningTip: "Understand the elemental composition of Earth's layers.",
    },
    {
      text: 'In Shakespeare\'s "Othello", who is the antagonist that manipulates the title character?',
      difficulty: Difficulty.HARD,
      categoryId: entertainmentCategory.id,
      options: [
        { text: "Cassio" },
        { text: "Roderigo" },
        { text: "Iago", isCorrect: true },
        { text: "Brabantio" },
      ],
      explanation:
        "Iago is the scheming villain in William Shakespeare's tragedy Othello, who manipulates Othello into believing his wife Desdemona is unfaithful, leading to tragic consequences.",
      learningTip:
        "Major characters and their roles in classic literature are common trivia.",
    },
    {
      text: "Which king signed the Magna Carta in 1215?",
      difficulty: Difficulty.HARD,
      categoryId: historyCategory.id,
      options: [
        { text: "King Henry VIII" },
        { text: "King Richard the Lionheart" },
        { text: "King John", isCorrect: true },
        { text: "King Edward I" },
      ],
      explanation:
        "King John of England signed the Magna Carta, a charter of rights agreed to by King John of England at Runnymede, Berkshire, on 15 June 1215.",
      learningTip:
        "Key historical documents and their associated figures are important.",
    },
    {
      text: "What is the Kardashev scale used to measure?",
      difficulty: Difficulty.HARD,
      categoryId: scienceCategory.id,
      options: [
        { text: "Earthquake intensity" },
        { text: "Stellar brightness" },
        { text: "A civilization's technological advancement", isCorrect: true },
        { text: "Cosmic microwave background radiation" },
      ],
      explanation:
        "The Kardashev scale is a method of classifying civilizations by their technological advancement based on the amount of energy they are able to use.",
      learningTip: "Explore concepts from theoretical physics and astronomy.",
    },
    {
      text: 'The philosophical concept of "tabula rasa" refers to the idea that humans are born with what?',
      difficulty: Difficulty.HARD,
      categoryId: historyCategory.id,
      options: [
        { text: "Innate knowledge" },
        { text: "Original sin" },
        { text: "A blank slate", isCorrect: true },
        { text: "A soul" },
      ],
      explanation:
        'Tabula rasa (Latin for "blank slate") is the theory that individuals are born without built-in mental content and that therefore all knowledge comes from experience or perception.',
      learningTip: "Familiarize yourself with famous philosophical concepts.",
    },
    {
      text: 'Which novel begins with the line, "It is a truth universally acknowledged..."?',
      difficulty: Difficulty.HARD,
      categoryId: entertainmentCategory.id,
      options: [
        { text: "Wuthering Heights" },
        { text: "Jane Eyre" },
        { text: "Pride and Prejudice", isCorrect: true },
        { text: "Sense and Sensibility" },
      ],
      explanation:
        'The opening line of Jane Austen\'s "Pride and Prejudice" is one of the most famous in English literature.',
      learningTip: "Know iconic opening lines of classic novels.",
    },
    {
      text: "What is the name of the supercontinent that existed millions of years ago?",
      difficulty: Difficulty.HARD,
      categoryId: historyCategory.id,
      options: [
        { text: "Gondwana" },
        { text: "Laurasia" },
        { text: "Pangaea", isCorrect: true },
        { text: "Rodinia" },
      ],
      explanation:
        "Pangaea was a supercontinent that existed during the late Paleozoic and early Mesozoic eras, forming approximately 335 million years ago.",
      learningTip: "Understand basic geological history of Earth.",
    },
    {
      text: "Which particle is its own antiparticle?",
      difficulty: Difficulty.HARD,
      categoryId: scienceCategory.id,
      options: [
        { text: "Neutron" },
        { text: "Electron" },
        { text: "Photon", isCorrect: true },
        { text: "Proton" },
      ],
      explanation:
        "A photon is its own antiparticle, meaning it is identical to its antiparticle. This is characteristic of particles with zero electric charge and zero magnetic moment.",
      learningTip: "Explore fundamental particles in physics.",
    },
    {
      text: "What is the name of the largest moon of Saturn?",
      difficulty: Difficulty.HARD,
      categoryId: scienceCategory.id,
      options: [
        { text: "Europa" },
        { text: "Ganymede" },
        { text: "Titan", isCorrect: true },
        { text: "Io" },
      ],
      explanation:
        "Titan is the largest moon of Saturn and the second-largest moon in the Solar System. It is the only moon known to have a dense atmosphere and the only object other than Earth for which clear evidence of stable bodies of surface liquid has been found.",
      learningTip: "Learn about major moons in our solar system.",
    },
    {
      text: "Who is considered the father of modern computer science?",
      difficulty: Difficulty.HARD,
      categoryId: historyCategory.id,
      options: [
        { text: "Charles Babbage" },
        { text: "John von Neumann" },
        { text: "Alan Turing", isCorrect: true },
        { text: "Ada Lovelace" },
      ],
      explanation:
        "Alan Turing was a British mathematician and computer scientist who is widely considered to be the father of theoretical computer science and artificial intelligence.",
      learningTip: "Know key figures in the history of technology.",
    },
    {
      text: "Which country has the most time zones?",
      difficulty: Difficulty.HARD,
      categoryId: generalCategory.id,
      options: [
        { text: "Russia" },
        { text: "USA" },
        { text: "France", isCorrect: true },
        { text: "China" },
      ],
      explanation:
        "France, including its overseas territories, has the most time zones of any country in the world, with 12 (13 including its claim in Antarctica).",
      learningTip: "Explore surprising geographical facts.",
    },
    {
      text: "What is the name of the Japanese art of flower arranging?",
      difficulty: Difficulty.HARD,
      categoryId: entertainmentCategory.id,
      options: [
        { text: "Origami" },
        { text: "Bonsai" },
        { text: "Ikebana", isCorrect: true },
        { text: "Sumi-e" },
      ],
      explanation:
        "Ikebana is the Japanese art of flower arrangement. It is more than simply putting flowers in a container. It is a disciplined art form in which nature and humanity are brought together.",
      learningTip: "Learn about traditional art forms from different cultures.",
    },
    {
      text: 'The "Doomsday Clock" is maintained by which organization?',
      difficulty: Difficulty.HARD,
      categoryId: scienceCategory.id,
      options: [
        { text: "United Nations" },
        { text: "World Health Organization" },
        { text: "Bulletin of the Atomic Scientists", isCorrect: true },
        { text: "NASA" },
      ],
      explanation:
        "The Doomsday Clock is a symbolic clock face, maintained since 1947 by the members of the Bulletin of the Atomic Scientists' Science and Security Board, that represents the likelihood of a man-made global catastrophe.",
      learningTip:
        "Understand significant scientific and geopolitical indicators.",
    },
    {
      text: "What is the only bird known to fly backwards?",
      difficulty: Difficulty.HARD,
      categoryId: scienceCategory.id,
      options: [
        { text: "Sparrow" },
        { text: "Eagle" },
        { text: "Hummingbird", isCorrect: true },
        { text: "Owl" },
      ],
      explanation:
        "Hummingbirds are the only birds that can truly fly backwards. They can also hover and fly upside down.",
      learningTip: "Explore unique adaptations in the animal kingdom.",
    },
    {
      text: "What is the main difference between a lager and an ale?",
      difficulty: Difficulty.HARD,
      categoryId: entertainmentCategory.id,
      options: [
        { text: "The type of grain used" },
        { text: "The alcohol content" },
        {
          text: "The type of yeast and fermentation temperature",
          isCorrect: true,
        },
        { text: "The color" },
      ],
      explanation:
        "The primary difference between lagers and ales lies in the type of yeast used and the fermentation temperature. Lagers use bottom-fermenting yeasts at colder temperatures, while ales use top-fermenting yeasts at warmer temperatures.",
      learningTip:
        "Understand basic classifications in food and drink production.",
    },
    {
      text: "Which of the following is not a programming language?",
      difficulty: Difficulty.HARD,
      categoryId: entertainmentCategory.id,
      options: [
        { text: "Python" },
        { text: "Cobra" },
        { text: "Anaconda", isCorrect: true },
        { text: "Ruby" },
      ],
      explanation:
        "Python, Cobra, and Ruby are programming languages. Anaconda is a distribution for Python and R programming languages, primarily used for data science and machine learning.",
      learningTip:
        "Distinguish between programming languages and related tools/distributions.",
    },
    {
      text: "What is the capital of Iceland?",
      difficulty: Difficulty.HARD,
      categoryId: generalCategory.id,
      options: [
        { text: "Oslo" },
        { text: "Helsinki" },
        { text: "Reykjavik", isCorrect: true },
        { text: "Copenhagen" },
      ],
      explanation:
        "Reykjavík is the capital and largest city of Iceland, known for its vibrant culture and natural beauty.",
      learningTip: "Challenge yourself with less common capitals.",
    },
    {
      text: "What is the standard unit of electrical resistance?",
      difficulty: Difficulty.HARD,
      categoryId: scienceCategory.id,
      options: [
        { text: "Volt" },
        { text: "Ampere" },
        { text: "Ohm", isCorrect: true },
        { text: "Watt" },
      ],
      explanation:
        "The ohm (symbol: Ω) is the SI derived unit of electrical resistance, named after German physicist Georg Simon Ohm.",
      learningTip: "Memorize fundamental units in physics.",
    },
    {
      text: "Which famous scientist developed the theory of general relativity?",
      difficulty: Difficulty.HARD,
      categoryId: scienceCategory.id,
      options: [
        { text: "Isaac Newton" },
        { text: "Galileo Galilei" },
        { text: "Albert Einstein", isCorrect: true },
        { text: "Stephen Hawking" },
      ],
      explanation:
        "Albert Einstein developed the theory of general relativity in 1915, which remains the current description of gravitation in modern physics.",
      learningTip:
        "Associate major scientific theories with their discoverers.",
    },
    {
      text: "What is the approximate speed of sound in air?",
      difficulty: Difficulty.HARD,
      categoryId: scienceCategory.id,
      options: [
        { text: "1,235 km/h" },
        { text: "343 m/s", isCorrect: true },
        { text: "767 mph" },
        { text: "All of the above" },
      ],
      explanation:
        "The speed of sound in dry air at 20 °C (68 °F) is 343 meters per second (1,235 km/h or 767 mph).",
      learningTip:
        "Understand approximate values of common physical constants.",
    },
    {
      text: "Which ancient civilization built the city of Machu Picchu?",
      difficulty: Difficulty.HARD,
      categoryId: historyCategory.id,
      options: [
        { text: "Aztec" },
        { text: "Maya" },
        { text: "Inca", isCorrect: true },
        { text: "Olmec" },
      ],
      explanation:
        "Machu Picchu is an ancient Inca citadel located in the Eastern Cordillera of southern Peru.",
      learningTip:
        "Connect ancient civilizations with their famous structures.",
    },
    {
      text: "What is the largest living species of lizard?",
      difficulty: Difficulty.HARD,
      categoryId: scienceCategory.id,
      options: [
        { text: "Gila Monster" },
        { text: "Green Iguana" },
        { text: "Komodo Dragon", isCorrect: true },
        { text: "Monitor Lizard" },
      ],
      explanation:
        "The Komodo dragon is the largest extant species of lizard, growing to a maximum length of 3 meters (10 ft).",
      learningTip: "Learn about record-breaking animal species.",
    },
    {
      text: "Which novel features the character of Atticus Finch?",
      difficulty: Difficulty.HARD,
      categoryId: entertainmentCategory.id,
      options: [
        { text: "1984" },
        { text: "The Catcher in the Rye" },
        { text: "To Kill a Mockingbird", isCorrect: true },
        { text: "The Great Gatsby" },
      ],
      explanation:
        'Atticus Finch is a central character in Harper Lee\'s classic novel "To Kill a Mockingbird," representing moral integrity.',
      learningTip: "Know key characters from celebrated works of literature.",
    },
  ];

  // 4. Create Questions and connect them to a category
  console.log("Creating questions...");
  for (const q of allQuestions) {
    await prisma.question.create({
      data: {
        text: q.text,
        difficulty: q.difficulty,
        categoryId: q.categoryId,
        explanation: q.explanation, // Add explanation
        learningTip: q.learningTip, // Add learningTip
        options: {
          create: q.options.map((opt) => ({
            text: opt.text,
            isCorrect: !!opt.isCorrect,
          })),
        },
      },
    });
  }

  console.log("Seeding finished.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
