document.addEventListener('DOMContentLoaded', () => {
    const menuContainer = document.getElementById('menu-container');
    const contentFrame = document.getElementById('content-frame');
    let activeMenuItem = null;

    // 1. Load and build the menu
    async function buildMenu() {
        try {
            // Fetch menu.json relative to index.html
            const response = await fetch('menu.json');
            
            if (!response.ok) {
                throw new Error(`Unable to load menu.json (Status: ${response.status})`);
            }
            
            const menuConfig = await response.json();

            // Clear existing menu (remove "Loading..." message)
            menuContainer.innerHTML = '';

            // Iterate config and create menu items
            menuConfig.forEach(category => {
                const categoryDiv = document.createElement('div');
                categoryDiv.className = 'menu-category';

                // Create category title
                if (category.category) {
                    const categoryTitle = document.createElement('div');
                    categoryTitle.className = 'menu-category-title';
                    categoryTitle.textContent = category.category;
                    categoryDiv.appendChild(categoryTitle);
                }

                // Create all tool links under this category
                if (category.items && Array.isArray(category.items)) {
                    category.items.forEach(item => {
                        const menuItem = document.createElement('a');
                        menuItem.className = 'menu-item';
                        menuItem.textContent = item.name;
                        // Store the original path
                        menuItem.dataset.path = item.path;
                        
                        categoryDiv.appendChild(menuItem);
                    });
                }

                menuContainer.appendChild(categoryDiv);
            });

            // Auto-load the first available tool
            const firstItem = document.querySelector('.menu-item');
            if (firstItem) {
                loadFunction(firstItem);
            }

        } catch (error) {
            console.error('Failed to build menu:', error);
            menuContainer.innerHTML = `
                <div style="padding: 20px; color: #ff6b6b; font-size: 0.9em;">
                    <strong>Failed to load menu</strong><br>
                    <br>
                    Please make sure:<br>
                    1. The menu.json file exists in the root directory<br>
                    2. If running locally, use a local web server (e.g., Live Server)<br>
                    <br>
                    Error: ${error.message}
                </div>
            `;
        }
    }

    // 2. Load tool into the iframe
    function loadFunction(menuItemElement) {
        let path = menuItemElement.dataset.path;
        if (!path) return;

        // Normalize the path to point to index.html
        // If it doesn't end with .html, append index.html
        // This is important for GitHub Pages compatibility
        if (!path.endsWith('.html')) {
            if (path.endsWith('/')) {
                path += 'index.html';
            } else {
                path += '/index.html';
            }
        }

        // Set iframe source
        contentFrame.src = path;

        // Update active state styles
        if (activeMenuItem) {
            activeMenuItem.classList.remove('active');
        }
        menuItemElement.classList.add('active');
        activeMenuItem = menuItemElement;
    }

    // 3. Event delegation for menu clicks
    menuContainer.addEventListener('click', (event) => {
        const target = event.target;
        // Ensure a menu item was clicked
        if (target.classList.contains('menu-item')) {
            loadFunction(target);
        }
    });

    // Initialize
    buildMenu();
});
