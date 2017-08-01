/**
* Generic hierarchical/tree selection control. It can either have the whole data structure
* or asynchronously load each level.
*
* Allows auto-complete searching of the tree, optional multiple selection
*/
angular.module('hierarchical-selector', [
  'hierarchical-selector.tree-item',
  'hierarchical-selector.selectorUtils'
])
.directive('hierarchicalSelector', ['$compile', '$timeout', '$q', 'selectorUtils', function ($compile, $timeout, $q, selectorUtils) {
  return {
    restrict: 'E',
    replace: true,
    templateUrl: 'hierarchical-selector.tpl.html',
    scope: {
      syncData: '=data',
      multiSelect: '=?',
      onSelectionChanged: '&',
      selectOnlyLeafs: '=?',
      canSelectItem: '&',
      loadChildItems: '&',
      itemHasChildren: '&',
        selection: '=',
      tagName: '&',
      placeholder: '@'
    },
    link: function(scope, element, attrs) {
      // is there a better way to know the callbacks are actually set. So we have make decisions on what to use
      if (attrs.canSelectItem) {
        scope.useCanSelectItemCallback = true;
      }
      if (attrs.loadChildItems) {
        scope.isAsync = true;
      }
      if (attrs.noButton === undefined) {
        scope.showButton = true;
      }
      if (attrs.tagName) {
        scope.useTagName = true;
      }

      // init async
      // if we have no data and have the callback
      if (!scope.syncData && scope.isAsync) {
        scope.dataLoadPromise = $q.when(
          scope.loadChildItems({parent: null})
        ).then(function(data) {
          scope.data = data;
        });
      }

      if (scope.syncData) {
        scope.data = scope.syncData;
        scope.$watch('syncData', function() {
          scope.data = scope.syncData;
        });
      }
    },
    controller: ['$scope', '$document', '$window', '$interpolate', function ($scope, $document, $window, $interpolate) {
      var activeItem;

      $scope.showTree = false;
      $scope.selectedItems = [];
      $scope.multiSelect = $scope.multiSelect || false;
      // we need somewhere to hold the async loaded children to reference them in navigation etc.
      $scope.asyncChildCache = {};

      function docClickHide(e) {
        closePopup();
        $scope.$apply();
      }

      function closePopup() {
        $scope.showTree = false;
        if (activeItem) {
          var itemMeta = selectorUtils.getMetaData(activeItem);
          itemMeta.isActive = false;
          activeItem = undefined;
        }
        // clear cache
        $scope.asyncChildCache = {};
        $document.off('click', docClickHide);
        $document.off('keydown', keyboardNav);
		if($scope.$parent.onViewClosed){
		  $scope.$parent.onViewClosed();
   }
      }

      function findById(id, inData) {
        if (!inData) {
          inData = $scope.data;
        }
        for (var i = 0; i < inData.length; i++) {
          var actualItem = inData[i];
          if (actualItem.id === id) {
            return actualItem;
          }

          var children = selectorUtils.getChildren(actualItem, $scope.isAsync, $scope.asyncChildCache);
          if (children) {
            var childResult = findById(id, children);
            if (childResult) {
              return childResult;
            }
          }
        }
        return null;
      }
      
      function idFilterFunc(id){
        return function(it){
          return it.id === id;
        };
      }

      function findItemOwnerAndParent(item, array, parentArray, parentIndex) {
        if (!array) {
          // we don't know where we are, find the array that we belong to
          return;
        }
        var itemIndex = array.indexOf(item);
        if (itemIndex > -1) {
          return {currentArray: array, parentArray: parentArray, parentIndex: parentIndex, itemIndex: itemIndex };
        }
        var newArray;
        for (var i = 0; i < array.length; i++) {
          if (selectorUtils.hasChildren(array[i], $scope.isAsync)) {
            newArray = findItemOwnerAndParent(item, selectorUtils.getChildren(array[i], $scope.isAsync, $scope.asyncChildCache), array, i);
            if (newArray) {
              break;
            }
          }
        }
        return newArray;
      }

      function findLowestExpandedItem(item) {
        var children = selectorUtils.getChildren(item, $scope.isAsync, $scope.asyncChildCache);
        var c = children[children.length -1];
        if (selectorUtils.getMetaData(c).isExpanded) {
          return findLowestExpandedItem(c);
        }
        return c;
      }

      /*
       * Get the next or previous item from a item in the tree
       */
      function getNextItem(down, item, array) {
        var itemData = findItemOwnerAndParent(item, array);
        var itemMeta = selectorUtils.getMetaData(item);

        if (down) {
          if (itemMeta.isExpanded) {
            // go down the branch
            return selectorUtils.getChildren(item, $scope.isAsync, $scope.asyncChildCache)[0];
          }
          if (itemData.itemIndex < itemData.currentArray.length -1) {
            // next item at this level
            return itemData.currentArray[itemData.itemIndex +1];
          }
          if (itemData.itemIndex == itemData.currentArray.length -1 && itemData.parentArray && itemData.parentIndex < itemData.parentArray.length -1) {
            // Next item up a level
            return itemData.parentArray[itemData.parentIndex +1];
          }
        }
        else {
          if (itemData.itemIndex > 0) {
            // previous item at this level
            var previousAtSameLevel = itemData.currentArray[itemData.itemIndex -1];
            if (selectorUtils.getMetaData(previousAtSameLevel).isExpanded) {
              // find the lowest item
              return findLowestExpandedItem(previousAtSameLevel);
            }
            return previousAtSameLevel;
          }
          if (itemData.itemIndex === 0 && itemData.parentArray) {
            // go to parent
            return itemData.parentArray[itemData.parentIndex];
          }
        }

        return item;
      }

      function changeActiveItem(down) {
        if (!activeItem) {
          // start at the top or bottom
          idx = down ? 0 : $scope.data.length -1;
          $scope.onActiveItem($scope.data[idx]);
        } else {
          $scope.onActiveItem(getNextItem(down, activeItem, $scope.data));
        }
        $scope.$apply();
      }

      // handle keyboard navigation
      function keyboardNav(e) {
        switch (e.keyCode) {
          // backspace
          // case 8: {

            // break;
          // }
          // ESC closes
          case 27: {
            e.preventDefault();
            e.stopPropagation();
            closePopup();
            $scope.$apply();
            break;
          }
          // space/enter - select item
          case 32:
          case 13: {
            e.preventDefault();
            e.stopPropagation();
            if (activeItem) {
              $scope.itemSelected(activeItem);
              $scope.$apply();
            }
            break;
          }
          // down arrow - move down list (next item, child or not)
          case 40: {
            e.preventDefault();
            e.stopPropagation();
            changeActiveItem(true);
            break;
          }
          // up arrow - move up list (previous item, child or not)
          case 38: {
            e.preventDefault();
            e.stopPropagation();
            changeActiveItem(false);
            break;
          }
          // left arrow - colapse node if open
          case 37: {
            e.preventDefault();
            e.stopPropagation();
            if (activeItem) {
              selectorUtils.getMetaData(activeItem).isExpanded = false;
              $scope.$apply();
            }
            break;
          }
          // right arrow - expand node if has children
          case 39: {
            e.preventDefault();
            e.stopPropagation();
            if (activeItem) {
              selectorUtils.getMetaData(activeItem).isExpanded = true;
              $scope.$apply();
            }
            break;
          }
        }
      }

      $scope.onActiveItem = function(item) {
        if (activeItem != item) {
          if (activeItem) {
            var itemMeta = selectorUtils.getMetaData(activeItem);
            itemMeta.isActive = false;
          }
          activeItem = item;
          var itemMeta2 = selectorUtils.getMetaData(activeItem);
          itemMeta2.isActive = true;
        }
      };

      $scope.expandParents = function () {
        if ($scope.isAsync) {
          for (var i = 0; i < $scope.selectedItems.length; i++) {
            var item = $scope.selectedItems[i];
            if (!item.id) { //We don't have an id set on the node, so we can't resolve it
              continue;
            }
            var parentToExpand = item;
            while(parentToExpand) {
              var mappedParent = findById(parentToExpand.id);
              if (!mappedParent || //The parent isn't in our dataset - it needs to be loaded 
                selectorUtils.getMetaData(mappedParent).isExpanded) { //We found a parent that's loaded, but it's already expanded,
                                                                      //See if any of it's parents need to be expanded too
                parentToExpand = parentToExpand.parent;
              } else {
                break;
              }
            }
            if (!parentToExpand || !parentToExpand.id) {
              //We didn't find a resolvable parent, or we found a parent with no id
              continue;
            }

            //We either have a root item, or all the parents are properly expanded
            //In that case, we check if we need to set the selected item to the one in $scope.data
            //Rather than the object given to us
            if (parentToExpand === item) {
              var actualNode = findById(item.id);
              if ($scope.multiSelect || item === actualNode) { //The correct item is already set
                selectorUtils.getMetaData(actualNode).selected = true; // if it's in selectedItems, it should be selected! Only really relevant for multi-select
                continue;
              } else {
                $scope.itemSelected(actualNode, true); //Now we set the correct 'selected node'
              }
            } else {
              //We found a parent. Expand it if it's not already expanded
              var actualItem = findById(parentToExpand.id);
              if (actualItem) {
                var metaData = selectorUtils.getMetaData(actualItem);
                if (!metaData.isExpanded) {
                  metaData.isExpanded = true;
                }
              }
            }
          }
        }
      };

      $scope.childExpanded = function() {        
        $timeout($scope.expandParents);
      };

      $scope.deselectItem = function(item, $event) {
        $event.stopPropagation();
		if($scope.multiSelect){
		  var itemMeta;
		  for(var it in $scope.selectedItems){
		    selectorUtils.getMetaData($scope.selectedItems[it]).selected = false;
		  }
		  $scope.selectedItems = [];
		}
		else
		{
          $scope.selectedItems.splice($scope.selectedItems.indexOf(item), 1);
					 
          var itemMeta = selectorUtils.getMetaData(item);
          itemMeta.selected = false;
		}
        if ($scope.onSelectionChanged) {
          $scope.onSelectionChanged({items: $scope.selectedItems.length ? $scope.selectedItems : undefined});
        }
        closePopup();
      };

      $scope.onButtonClicked = function($event) {
        if ($scope.showTree) {
          closePopup();
        }
        else {
          $scope.onControlClicked($event);
        }
      };

      $scope.onControlClicked = function($event) {
        $event.stopPropagation();
        if (!$scope.showTree) {
          $scope.showTree = true;

          $document.on('click', docClickHide);
          $document.on('keydown', keyboardNav);
        }
      };

      $scope.itemSelected = function(item, skipClose) { //triggers for each individual item clicked
        if(angular.isArray(item)){
          for(var i = 0; i<item.length; i++){
            if (($scope.useCanSelectItemCallback && $scope.canSelectItem({item: item[i]}) === false) || ($scope.selectOnlyLeafs && selectorUtils.hasChildren(item[i], $scope.isAsync))) {
              return;
            }
          }
        } else {
          if (($scope.useCanSelectItemCallback && $scope.canSelectItem({item: item}) === false) || ($scope.selectOnlyLeafs && selectorUtils.hasChildren(item, $scope.isAsync))) {
            return;
          }
        }
        $scope.dataLoadPromise.then(function() {
          if(!angular.isArray(item)){
            item = [item];
          }
          for(var i = 0; i<item.length; i++){
            var itemMeta = selectorUtils.getMetaData(item[i]);
            if (!$scope.multiSelect) {
              if (!skipClose) {
                closePopup();
              }
              for (var j = 0; j < $scope.selectedItems.length; j++) {
                selectorUtils.getMetaData($scope.selectedItems[j]).selected = false;
            }

            itemMeta.selected = true;
            $scope.selectedItems = [];
            $scope.selectedItems.push(item[i]);
            } else {
              var indexOfItem = $scope.selectedItems.findIndex(idFilterFunc(item[i].id));
              if (indexOfItem > -1) {
                itemMeta.selected = false;
                $scope.selectedItems.splice(indexOfItem, 1);
              } else {
                itemMeta.selected = true;
                $scope.selectedItems.push(item[i]);
              }
            }
          }

          if ($scope.onSelectionChanged) {
            $scope.onSelectionChanged({items: $scope.selectedItems.length ? $scope.selectedItems : undefined});
          }

          $timeout($scope.expandParents);
        });
      };

      $scope.clearSelection = function() {
        $scope.selectedItems = [];
        if ($scope.onSelectionChanged) {
          $scope.onSelectionChanged({items: undefined});
        }
      };

      $scope.$watch('selection', function(newValue, oldValue) {
        if (newValue) {
          $scope.itemSelected(angular.copy(newValue));
        }
        else if ($scope.selectedItems.length > 0) { // only clear if it is changing/don't trigger a onSelectionChanged
          $scope.clearSelection();
        }
      });

      $scope.getTagName = function(i) {
        if ($scope.useTagName) {
           return $scope.tagName({ item: i });
        }
            return i.name;
      };
    }]
  };
}])
;