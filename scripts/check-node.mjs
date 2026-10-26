const major = Number(process.versions.node.split('.')[0]);

if (major < 24) {
  console.error(`\nThreadscape 需要 Node.js 24 或更高版本，当前为 ${process.version}。`);
  console.error('请关闭当前终端，安装 Node.js 24 LTS 后重新打开终端。\n');
  process.exit(1);
}

console.log(`Node.js ${process.version} ✓`);
