import { isCloudinaryImage, enhancedUrl } from "../lib/photo.ts";

let ok = 0,
  fail = 0;
const check = (name: string, cond: boolean) => {
  if (cond) ok++;
  else {
    fail++;
    console.log(`✗ ${name}`);
  }
};

const cl = "https://res.cloudinary.com/demo/image/upload/v123/familytree/a.jpg";
const nonCl = "https://example.com/a.jpg";

check("isCloudinaryImage true", isCloudinaryImage(cl));
check("isCloudinaryImage false", !isCloudinaryImage(nonCl));

const enh = enhancedUrl(cl);
check("dönüşüm enjekte edilir", enh.includes("/image/upload/e_improve,e_sharpen,q_auto/"));
check("public_id korunur", enh.endsWith("v123/familytree/a.jpg"));
check("idempotent", enhancedUrl(enh) === enh);
check("cloudinary değilse dokunmaz", enhancedUrl(nonCl) === nonCl);

console.log(`\n${ok}/${ok + fail} geçti${fail ? `, ${fail} başarısız` : " ✓"}`);
if (fail) process.exit(1);
