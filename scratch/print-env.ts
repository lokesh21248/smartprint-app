console.log("Environment Keys:", Object.keys(process.env).filter(k => !k.includes("KEY") && !k.includes("SECRET")));
console.log("Database URL present?", !!process.env.DATABASE_URL);
console.log("Direct URL present?", !!process.env.DIRECT_URL);
